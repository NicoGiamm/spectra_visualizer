---
name: mission-tracker
description: "Missions and their tasks for spectra_visualizer, planned in GitHub Issues: a mission is a parent issue (label mission) with one branch mission/M<N>-<slug> + one worktree, each task a linked sub-issue (label task), all on project 4. Propose / approve / start a mission, open tasks (in parallel when the cli finds them independent) and close them with evidence, record decisions, list what is open, run the consistency gate `check`. Use for 'new mission', 'start M4', 'work on M1/T6', 'next task', 'where are we', 'task done', 'record this decision', and at the start of any repo-changing conversation."
argument-hint: "[list | next | show M<N>[/T<k>] | propose \"title\" | start M<N> | task M<N>/T<k> … | check [M<N>]]"
allowed-tools: Bash(uv run .claude/skills/mission-tracker/cli.py *) Bash(git status *) Bash(git log *) Bash(git diff *)
---

# mission-tracker — missions and tasks as GitHub issues, code on one branch + worktree per mission

Run as `uv run .claude/skills/mission-tracker/cli.py <command>` from any checkout (inside a worktree too).
Arguments given: `$ARGUMENTS`. The flow is `.claude/sdlc.md`; the board's shape and guardrails are
`.claude/rules/missions.md`; values (repo, project, labels, statuses) come from `.claude/sdlc.toml`.

Open missions now:

!`uv run .claude/skills/mission-tracker/cli.py list 2>&1 | head -20`

## Hard rules

- A new mission is **proposed** to the user (Problem, Scope, Delivery, tasks) and `approve`d only after their OK;
  tasks inside an approved mission are added freely.
- **Only this cli creates, moves and closes mission/task issues** (plus `ship merge` for the mission). Never close
  an issue on GitHub, drag it to Done or run a bare `gh issue close` — user decision 2026-11-22. Editing Goal /
  Plan / Acceptance / Notes text on GitHub and ticking *verified* Acceptance boxes is fine.
- **`check` is a gate**: `start`, `task` (opening), `ship review-brief` and `ship merge` refuse (exit 3) while the
  mission has findings. Fix the board (or the body) first; never work around it.
- `task --done` is the only way a task closes: refused without an evidence file or with an unticked box; it writes
  the Outcome, closes the issue as completed, sets Done and verifies both on GitHub.
- **Parallel tasks**: independent tasks of a mission may run at the same time, one `step-dev` per task. The cli
  decides: disjoint Plan `files:` (a directory covers everything under it) and no `Depends on:` link between them.
  `task` refuses a conflicting task, naming the task and the shared paths; a task without a real `files:` line
  runs alone. Dependent or overlapping tasks run one after another.
- Nothing of the plan goes into the repository. Dates come from the work; the cli stamps them. Decisions →
  `log M<N> "…" --decision`; out-of-scope findings → a `gap` task.

## Commands

| Command | What it does on GitHub |
|---|---|
| `list [--delivered]` | open `mission` issues: issue #, status, tasks done/total (sub-issues), ahead/behind main, worktree; `--delivered` adds closed ones |
| `next [M<N>]` | the next open task (active missions first, then planned) |
| `show M<N>[/T<k>]` or `show #<n>` | the issue body, its sub-issues (for a mission), labels, project Status, URL |
| `propose "<title>" [--slug s]` | creates issue `M<next> — title` from the template (label `mission`), adds it to project 4 as Todo, creates branch `mission/M<next>-<slug>` + worktree |
| `add-task M<N> "<title>" [--label gap]…` | creates `M<N>/T<next> — title` (label `task` + kinds), links it as a sub-issue (verified; on failure the new issue is deleted), project Todo, `- #<n>` into `## Tasks` |
| `approve M<N>` | after the user's OK: strict check (no template placeholders in mission or tasks), body Status `planned`, Log line |
| `start M<N>` | gate, then worktree (re-opened if closed), body Status `active`, project In Progress; then `EnterWorktree path=<worktree>` |
| `open M<N>` / `close-worktree M<N>` | open / drop the worktree of a proposed or planned mission (no GitHub change) |
| `task M<N>/T<k>` | gate + independence check, body `in-progress` + Started, project In Progress; prints the task |
| `task M<N>/T<k> --done --evidence FILE` | every Acceptance box ticked → FILE into `## Outcome`, Completed, closed (completed) + Done, re-read and verified (retries, else exit 1); Log line on the mission |
| `log M<N> "<text>" [--decision]` | dated line into `## Log` (and `## Key decisions`) |
| `sync M<N>` | re-derive `## Tasks` (`- #<n>` per sub-issue; GitHub renders their live state) |
| `check [M<N>]` | the gate: labels, sub-issue links, body Status = issue state = project Status, on project 4, in-progress tasks independent and not waiting on an open dependency, sections, closed tasks ticked + with Outcome; flags `.claude/missions/` tracked on main |
| `session` | what the session-start hook prints: open missions, this worktree's next task, check findings |

Mutating commands take `--dry-run`: they print every `gh`/`git` call (and a diff of each body edit) instead of
running it, and exit 3 if a gate would have refused. Exit codes: 0 ok · 1 failed (GitHub/git error, `check`
findings) · 3 refused (a gate). Issues labelled `test` are invisible unless `SPECTRA_TEST_ISSUES=1`.

## Recipes

| Need | Do |
|---|---|
| Plan new work | `propose "…"` → fill Problem / Scope / Delivery in the issue → `add-task` per deliverable → fill Goal / Plan (`files:`, `Depends on:` if any) / Acceptance → show the user → `approve M<N>` |
| Work a mission | `start M<N>` → `EnterWorktree path=…` → `task M<N>/T<k>` → explore, plan, implement, `/verify-scene`, commit `(refs M<N>/T<k>)` → tick the verified boxes in the issue → evidence file in the scratchpad → `task … --done --evidence …` |
| Delegate tasks | `task` each one you want to run now (the cli accepts only independent ones) → one `step-dev` per accepted task with its ref and the worktree path; review each diff; commit each by explicit path with its own `refs`, then `--done` |
| Where are we | `list`, then `next`; `check` if anything looks off |
| Read a delivered mission | `list --delivered` → `show M<N>` (the closed issue, its delivery comment and sub-issues) |

## Related

- `.claude/sdlc.md` (lifecycle, the board gate, parallel tasks, definition of done), `.claude/rules/missions.md`.
- `/ship` (review gate + merge, one per mission once all tasks are done), `/verify-scene`; agents `step-dev`,
  `reviewer`, `physics-auditor`.
