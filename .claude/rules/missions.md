---
paths:
  - ".claude/missions/**"
  - ".claude/templates/**"
  - ".claude/sdlc.toml"
  - ".claude/lib/**"
  - ".claude/skills/mission-tracker/**"
  - ".claude/skills/ship/**"
---

# Missions — the planning store, one branch per mission

Planned work = missions made of tasks. **A mission's files live only on its branch** `mission/M<N>-<slug>` (and
its worktree), never on `main`: `ship merge` leaves `.claude/missions/` out of the merge commit. Flow:
`.claude/sdlc.md`; commands: `/mission-tracker`, `/ship`; shapes: `.claude/templates/` and `[standard]` in
`.claude/sdlc.toml` (checked by `mission-tracker check`).

## Shape of the store

```
on branch mission/M<N>-<slug> only:
.claude/missions/M<N>-<slug>/mission.md          frontmatter id/title/status/branch/created
                                                 ## Problem · Scope · Delivery · Current state · Key decisions · Tasks · Log
.claude/missions/M<N>-<slug>/tasks/T<k>-<slug>.md
                                                 frontmatter id/title/status/labels/started/completed
                                                 ## Goal · Plan (`files:` line) · Acceptance (checklist) · [Notes] · Outcome
.claude/missions/M<N>-<slug>/*.md                optional reference files of that mission (e.g. M2's audit.md)
```

| | Statuses | Meaning |
|---|---|---|
| Mission | `proposed` → `planned` → `active` → *(delivered)* | written · user approved · started (worktree, tasks being worked) · merged into `main`, branch deleted — no status, the merge commit is the record |
| Task | `backlog` → `in-progress` → `done` | `in-progress` only inside an active mission, one at a time |
| Task labels | `needs-verification`, `needs-decision`, `blocked`, `gap`, `bug` | waiting states and kinds are labels, never statuses |

Reading: `mission-tracker list | show | next` read a mission from its worktree, else straight from the branch.
Writing needs the worktree; the cli opens it (`open`, or any write command) and commits **only the mission's
folder** on the branch.

## Guardrails

1. **MUST link every repo change to a mission task before the first edit**, unless the user opts out explicitly
   (then the commit on `main` carries `[no-mission]`). Pure questions and read-only diagnostics are exempt.
2. **MUST propose a new mission to the user (Problem, Scope, Delivery, task list) and `approve` it only after their
   OK.** Tasks inside an approved mission are added freely (`add-task`).
3. **MUST NOT put planning files on `main`** — no `.claude/missions/`, no `.claude/plans/`, no roadmap file. —
   user decision 2026-11-21: `main` stays lean; `mission-tracker check` flags a tracked `.claude/missions/` on `main`.
4. **MUST write status changes through the cli** (`propose`, `add-task`, `approve`, `start`, `task`, `log`): it
   keeps frontmatter, the task table and the Log consistent. Hand edits of Goal / Plan / Acceptance / Notes text
   are fine — commit them on the branch with `refs`, then `mission-tracker check`.
5. **MUST NOT tick an Acceptance item that was not verified**, nor close a task without an Outcome stating the
   numbers (draw calls before → after, timeline warnings) and what was *not* verified. — 2026-11-21: parallel agents
   overstated progress and the old plan had to be re-audited.
6. **MUST NOT reword a Goal to match what was built** — record the deviation under `## Notes`.
7. **MUST record decisions with `mission-tracker log M<N> "…" --decision`** and surprises outside the task as a
   `gap` task of the right mission — never only in the chat or the code. A durable convention also goes into the
   matching `.claude/rules/*.md` (in the mission's diff): the rule is the law, the mission is the history.
8. **Dates come from the work** (the cli stamps today on the action); never invent past dates.

## Non-derivable facts

- M1–M5 and M7 were migrated on 2026-11-21 from the retired `.claude/plans/improvement-plan.md` (read it with
  `git show 6ea7dd6:.claude/plans/improvement-plan.md`): mission = old phase, task = old step, so "plan N.k" in
  commit messages and code comments means `MN/Tk`. Phases 0 and 6 were already done (numbers M0, M6 reserved in
  `sdlc.toml`, no branch).
- Tasks labelled `needs-verification` (M3, M4) were implemented on `main` before missions existed (c9b3fb3,
  a9adb2f, 82e40cf, 5e7b36b) and never reviewed: verifying them against their Acceptance is the work.
- Open question Q2 (a "Typical night" mode playing only `common` events, vs the current "one improbable night")
  is undecided; it becomes a mission when the user decides.
