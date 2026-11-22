---
name: ship
description: "Deliver a spectra_visualizer mission into main, only on the user's word: reviewer gate (fresh-context agent fed `review-brief`), align with main, timeline gate, one --no-ff merge commit, then the mission issue marked delivered, closed and set Done on the board (verified), worktree + branch cleanup. Use for 'ship it', 'ship M4', 'is it ready to merge', 'merge the mission', 'partial delivery'."
argument-hint: "<status|align|review-brief|deliver|merge|record|cleanup> M<N>"
allowed-tools: Bash(uv run .claude/skills/ship/cli.py status *) Bash(uv run .claude/skills/ship/cli.py review-brief *) Bash(uv run .claude/skills/ship/cli.py deliver *) Bash(uv run .claude/skills/ship/cli.py align *) Bash(git status *) Bash(git log *) Bash(git diff *)
---

# ship — a mission branch into main

Run as `uv run .claude/skills/ship/cli.py <command> M<N>` from any checkout. Arguments: `$ARGUMENTS`.
The lifecycle is `.claude/sdlc.md` stages 11–14. The mission and its tasks are GitHub issues (`/mission-tracker`);
one review and one merge per mission, once all its tasks are done — also when tasks were worked in parallel.

## Hard rules

- Only on the user's word: when a mission's tasks are done, **ask** "ship M<N> now?" once; `merge` runs only after
  an explicit OK. Pushing is a separate OK.
- **No merge without an independent review** for the current head: the `reviewer` agent gets only the
  `review-brief` output; its block is recorded by `deliver`. A later commit (fixes, `align`) needs a new review.
  The user may override in words (`VERDICT: ok (owner override: <why>)`), never the agent on its own.
- **The board gate**: `review-brief` and `merge` refuse (exit 3) while `mission-tracker check M<N>` has findings
  — user decision 2026-11-22.
- `merge` refuses (exit 3): a mission that is not active, a dirty worktree, a branch that doesn't contain `main`
  (→ `align`), no `ok` for the head, check findings, open sub-issues without `--partial`, staged changes in the
  main checkout. Fails (exit 1): the quality gate, the timeline gate (`spectra timeline` in the worktree must print
  0 warnings), a code conflict, a GitHub update that does not stick.
- After the merge commit `merge` itself writes `**Status:** delivered (<sha>)`, posts a delivery comment, closes
  the mission issue as completed and sets it Done on project 4, then re-reads both (retries, else exit 1 naming
  the `record` command that finishes it). Never close the mission issue by hand.
- The merge commit never contains a stale legacy `.claude/missions/` (old branches still carry one); no planning
  file reaches `main`.

## Commands

| Command                                                | What it does                                                                                                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status M<N>`                                          | ahead/behind main, dirty, open tasks, check findings, recorded verdict vs head, the next step                                                                           |
| `align M<N>`                                           | merge the current main into the branch (a stale legacy `.claude/missions/` keeps the branch's copy); conflicts → exit 1                                                 |
| `review-brief M<N> [--out FILE]`                       | gate, then the reviewer's input: mission + tasks from the issues (Goal / Plan / Acceptance / Notes / Outcome), diff range, changed files, matching rules, reviewed head  |
| `deliver M<N> --verdict-file FILE --reviewed-head SHA` | record FINDINGS / DOCS / VERDICT for that head (`.claude/logs/review-M<N>.json`, git-ignored)                                                                           |
| `merge M<N> [--partial] [--keep]`                      | after the OK: gates → `git merge --no-ff --no-commit` → drop legacy `.claude/missions/` → merge commit → issue delivered + closed + Done (verified) → remove worktree + branch (`--partial`: issue stays open, Log line + comment; `--partial`/`--keep`: the branch continues) |
| `record M<N> --sha SHA [--partial] [--dry-run]`        | only when `merge` merged but could not update GitHub: does the issue side of the delivery (refused with open tasks unless `--partial`)                                  |
| `cleanup M<N>`                                         | remove a fully delivered mission's worktree + branch (refused with undelivered commits)                                                                                 |

## Steps

1. `status M<N>`; if behind: `align M<N>`.
2. `review-brief M<N> --out <scratchpad>/brief-M<N>.md`; launch `reviewer` with only that file's content (and
   `physics-auditor` on the touched events if events or `spectrum.js` changed). Fix findings with commits
   `(refs M<N>/T<k>)` and review again until `VERDICT: ok`.
3. Write the verdict block to `<scratchpad>/verdict-M<N>.md`; `deliver M<N> --verdict-file … --reviewed-head <sha
from the brief>`.
4. Tell the user what ships (tasks, verdict, numbers) and ask. On OK: `merge M<N>` (`--partial` if they want part).
5. Report the merge sha; ask before `git push`.

## Related

- `.claude/sdlc.md`, `.claude/rules/missions.md`; `/mission-tracker`; agents `reviewer`, `physics-auditor`.
