---
paths:
  - ".claude/templates/**"
  - ".claude/sdlc.toml"
  - ".claude/sdlc.md"
  - ".claude/lib/**"
  - ".claude/hooks/**"
  - ".claude/skills/mission-tracker/**"
  - ".claude/skills/ship/**"
---

# Missions — GitHub issues for the plan, one branch per mission for the code

Planned work = missions made of tasks. **The plan lives in GitHub Issues** of `NicoGiamm/spectra_visualizer`, on
the user project 4 "Spectralmap" — user decision 2026-11-22 (it replaced the per-branch `.claude/missions/`
files of 2026-11-21). The code still lives on one branch `mission/M<N>-<slug>` + one worktree per mission, merged
`--no-ff` by `ship`. Flow: `.claude/sdlc.md`; commands: `/mission-tracker`, `/ship`; issue-body shapes:
`.claude/templates/` and `[standard]` / `[github]` in `.claude/sdlc.toml` (enforced by `mission-tracker check`).

## Shape of the board

```
mission  issue "M<N> — <title>"            label mission · project Status Todo / In Progress / Done
         <!-- spectra:mission M<N> -->
         **Branch:** `mission/M<N>-<slug>` · **Status:** proposed|planned|active|delivered (<sha>) · **Created:** <date>
         ## Problem · Scope · Delivery · Current state · Key decisions · Tasks · Log  [· Reference files]
task     sub-issue "M<N>/T<k> — <title>"   label task (+ gap / needs-verification / needs-decision / blocked / bug)
         <!-- spectra:task M<N>/T<k> -->
         **Mission:** #<parent> · **Status:** backlog|in-progress|done · **Started:** … · **Completed:** …
         ## Goal · Plan (`files:` line, optional `Depends on:` line) · Acceptance (`- [ ]` checklist) · [Notes] · Outcome
```

| | Body Status → issue state + project Status | Meaning |
|---|---|---|
| Mission | `proposed`, `planned` → open + Todo · `active` → open + In Progress · `delivered (<sha>)` → closed (completed) + Done | written · user approved · started (worktree, tasks being worked) · merged into `main` |
| Task | `backlog` → open + Todo · `in-progress` → open + In Progress · `done` → closed (completed) + Done | `in-progress` only inside an active mission; several at once only if independent (guardrail 7) |
| Task labels | `needs-verification`, `needs-decision`, `blocked`, `gap`, `bug` | waiting states and kinds are labels, never statuses |

Reading: `mission-tracker list | show | next | check` — one GraphQL query, nothing cached on disk. Reference
material of a mission (M2's event audit, M4's audit) is posted as comments on its issue.

## Guardrails

1. **MUST link every repo change to a mission task before the first edit**, unless the user opts out explicitly
   (then the commit on `main` carries `[no-mission]`). Pure questions and read-only diagnostics are exempt.
2. **MUST propose a new mission to the user (Problem, Scope, Delivery, task list) and `approve` it only after their
   OK.** Tasks inside an approved mission are added freely (`add-task`).
3. **MUST NOT put planning files in the repository** — no `.claude/missions/`, `.claude/plans/` or roadmap file on
   any branch. — user decision 2026-11-22. Old branches (M1, M2, M3, M5, M7) still carry a stale
   `.claude/missions/` from before: the tools ignore it, `ship align` keeps the branch's copy, `ship merge` always
   leaves it out of the merge commit, `check` flags it if `main` ever tracks it.
4. **MUST create and move mission/task issues only through the cli** (`propose`, `add-task`, `approve`, `start`,
   `task`, `log`, `ship merge`): it applies the labels, links every task as a sub-issue of its mission (an
   unlinkable new issue is deleted, never left orphaned), and keeps body Status, issue state and project Status in
   step. Hand edits of Goal / Plan / Acceptance / Notes text on GitHub are fine; ticking a verified Acceptance box
   on GitHub is how a task becomes closable.
5. **MUST close a task only with `mission-tracker task M<N>/T<k> --done --evidence FILE`** — never by closing the
   issue on GitHub, dragging it to Done, or a bare `gh issue close`. — user decision 2026-11-22. In that one
   command the cli checks every Acceptance box is ticked, writes FILE into `## Outcome`, sets Completed, closes the
   issue as completed, sets the project Status Done, re-reads both and retries, exiting non-zero if they don't
   stick. `ship merge` does the same for the mission (`delivered (<sha>)`, delivery comment, closed + Done).
6. **MUST keep `mission-tracker check [M<N>]` at 0 findings; the cli enforces it** — user decision 2026-11-22.
   Per mission it verifies: `mission` label on the parent and `task` on every task; every task a sub-issue of its
   mission (and no `M<N>/T*` issue outside it); body Status = issue state = project Status (table above); every
   issue on project 4; no two in-progress tasks that conflict and no in-progress task with an open dependency
   (guardrail 7); the sections; a closed task has all Acceptance ticked and an Outcome. `start`, `task` (opening
   a task), `ship review-brief` and `ship merge` **refuse (exit 3)** while the mission has findings; the
   session-start hook prints them.
7. **Independent tasks of a mission MAY be worked in parallel — one `step-dev` agent per task; the cli decides
   independence, not the model.** — user decision 2026-11-22. Two tasks are independent when their Plan `files:`
   lines share no path (compared as normalised sets; a directory entry covers everything under it) and neither
   lists the other in its `Depends on:` line (task refs `M<N>/T<k>` or `#<issue>`). A task without a real `files:`
   line conflicts with everything, so it runs alone. `task M<N>/T<k>` refuses (exit 3) — naming the task and the
   shared paths — a task that conflicts with one in progress or whose dependency is still open; dependent or
   overlapping tasks run one after another. Shipping is unchanged: one review and one merge per mission, once all
   its tasks are done.
8. **MUST NOT tick an Acceptance item that was not verified**, nor close a task without an Outcome stating the
   numbers (draw calls before → after, timeline warnings) and what was *not* verified. — 2026-11-21: parallel agents
   overstated progress and the old plan had to be re-audited.
9. **MUST NOT reword a Goal to match what was built** — record the deviation under `## Notes`.
10. **MUST record decisions with `mission-tracker log M<N> "…" --decision`** and surprises outside the task as a
   `gap` task of the right mission — never only in the chat or the code. A durable convention also goes into the
   matching `.claude/rules/*.md` (in the mission's diff): the rule is the law, the mission is the history.
11. **Dates come from the work** (the cli stamps today on the action); never invent past dates.

## Non-derivable facts

- Project 4 has GitHub's built-in automations on: sub-issues are auto-added to the board, an issue closed on
  GitHub is moved to Done, and an item set to Done gets closed. So a hand close or a drag to Done looks
  "consistent" on the board — `check` still catches it (body Status, unticked Acceptance, empty Outcome). Found
  2026-11-22.
- Issues #1–#36 were migrated on 2026-11-22 from the per-branch files; M4 (#18) is delivered (bae1ea7).
  M1–M5 and M7 came on 2026-11-21 from the retired `.claude/plans/improvement-plan.md` (`git show
  6ea7dd6:.claude/plans/improvement-plan.md`): mission = old phase, task = old step, so "plan N.k" in commit
  messages and code comments means `MN/Tk`. Phases 0 and 6 were already done (numbers M0, M6 reserved in
  `sdlc.toml`, no issue).
- Tasks labelled `needs-verification` (M3) were implemented on `main` before missions existed (c9b3fb3, a9adb2f,
  82e40cf, 5e7b36b) and never reviewed: verifying them against their Acceptance is the work.
- Throw-away harness tests use issues labelled `test`: invisible to the clis unless `SPECTRA_TEST_ISSUES=1`
  (#37–#44 were the 2026-11-22 round trip and gate demos, closed and taken off the board).
- Open question Q2 (a "Typical night" mode playing only `common` events, vs the current "one improbable night")
  is undecided; it becomes a mission when the user decides.
