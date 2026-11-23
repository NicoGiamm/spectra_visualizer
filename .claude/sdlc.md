# SDLC — how a change goes from idea to `main`

One maintainer, one long-lived branch (`main`), no CI and no test suite: the **headless render**
(`spectra shot`) and the **timeline physics check** (`spectra timeline`) are the tests. Planned work is
**missions** made of **tasks**, planned in **GitHub Issues** (user decision 2026-11-22): a mission is a parent
issue `M<N> — <title>` (label `mission`), each task a sub-issue `M<N>/T<k> — <title>` (label `task`), all on
project 4 "Spectralmap" (Status Todo / In Progress / Done). The code of a mission lives on one branch
`mission/M<N>-<slug>` + one worktree; no planning files exist in the repository. A mission reaches `main` as one
`--no-ff` merge commit, after a fresh-context review and the user's word; then its issue is closed as delivered.

Adapter values (repo, project, names, paths, the issue standard): `.claude/sdlc.toml`. Board conventions and
guardrails: `.claude/rules/missions.md`. Commands: `/mission-tracker`, `/ship`, `/verify-scene`.

## Roles

| Who | Owns |
|---|---|
| **User** | which missions exist (approves proposals), decisions, "ship now?", every `git push` |
| **Main session** | the lifecycle below: proposes, starts, works tasks (or delegates), verifies, commits in the worktree, gets the review, ships after the OK |
| `step-dev` agent | implements **one** task in the mission's worktree and verifies it; never commits — one task per agent; parallel agents only for tasks the cli accepts as independent |
| `reviewer` agent | fresh-context review of the whole mission diff before a merge; read-only |
| `physics-auditor` agent | checks events / `spectrum.js` against real physics; read-only |

## The lifecycle

```
propose ─▶ proposed ─user OK─▶ planned ─start─▶ active ─┬─ per task: open → explore → plan → implement → verify → commit → done
(issue + branch     (approve)            (EnterWorktree)│
 + worktree)                                            └─ all done ─▶ "ship now?" ─▶ review-brief → reviewer → deliver
                                                           ─▶ user OK ─▶ ship merge: --no-ff into main, issue delivered (<sha>),
                                                              closed + Done (verified); worktree + branch removed
```

| # | Stage | Command | Exit gate |
|---|---|---|---|
| 1 | **Propose**: creates the mission issue (label `mission`, project Todo) + `mission/M<N>-<slug>` off `main` + its worktree; fill Problem / Scope / Delivery in the issue; each task is a linked sub-issue (Goal, Plan `files:`, Acceptance) | `mission-tracker propose "<title>"`, `add-task M<N> "<title>"` | shown to the user |
| 2 | **Approve** — only after the user's OK | `mission-tracker approve M<N>` | strict standard check (no template placeholders); status `planned` |
| 3 | **Start** (a planned mission without a worktree gets one back) | `mission-tracker start M<N>`, then `EnterWorktree path=<worktree>` | `check M<N>` clean (else refused); issue `active` + In Progress; `ship align` if `main` moved |
| 4 | **Open a task** — several at once only if independent (below) | `mission-tracker task M<N>/T<k>` | `check M<N>` clean, independent of every in-progress task, no open dependency (else refused); Plan has real `files:`, Acceptance is checkable; issue `in-progress` + In Progress |
| 5 | **Explore** the files; record the baseline `spectra timeline <ids>`; broad searches → Explore agent | — | baseline numbers known |
| 6 | **Plan**: files, new `SPECTRUM` processes (sourced), seeded-`R` impact, draw-call cost, the moments/bands that prove it. Large task → plan mode, user approves | — | plan stated / approved |
| 7 | **Implement** the smallest change that meets Acceptance — main session or one `step-dev` per task | — | nothing outside the task's Plan (else a `gap` task) |
| 8 | **Verify** | `/verify-scene <ids>` | timeline 0 warnings; shots at 5/30/54 + instrument view exit 0; PNGs inspected |
| 9 | **Commit** in the worktree, by explicit path, `(refs M<N>/T<k>)`; checkpoint commits allowed | `git commit` (git_guard checks) | — |
| 10 | **Close the task**: tick the verified Acceptance boxes in the issue, write the evidence (what changed, numbers, not verified) | `mission-tracker task M<N>/T<k> --done --evidence <file>` — the only way a task closes | refused unless every box is ticked; Outcome written, issue closed (completed) + Done, both re-read and verified |
| 11 | **Ship?** When the tasks are done, ask the user once: "ship M<N> now?" | — | the user's word |
| 12 | **Review** the whole mission diff | `ship review-brief M<N>` (refused unless `check M<N>` is clean) → `reviewer` (+ `physics-auditor` if events/spectrum changed) → `ship deliver M<N> --verdict-file … --reviewed-head …` | `VERDICT: ok` for the current head (a later commit needs a new review) |
| 13 | **Merge** after the user's OK | `ship align M<N>` if `main` moved (then re-review), `ship merge M<N>` | active mission · `check M<N>` clean · reviewer `ok` @ head · branch contains `main` · no open sub-issue (unless `--partial`) · quality gate (ruff format/check, ty) · timeline gate 0 warnings · `--no-ff` merge (a stale legacy `.claude/missions/` left out) · issue `delivered (<sha>)` + comment, closed + Done, verified · worktree + branch removed |
| 14 | **Push** | only when the user says so | — |

**Partial delivery** (the user wants part of a mission on `main` now): `ship merge M<N> --partial` — the branch and
the issue stay open (a Log line + comment record the sha); `ship align M<N>` before new work. If `merge` merged but
GitHub could not be updated, it says so and `ship record M<N> --sha <sha> [--partial]` finishes the issue side.

## The board gate — MUST, enforced by the cli

User decision 2026-11-22: the board is a gate, not advice. `mission-tracker check [M<N>]` verifies per mission the
labels (`mission` / `task`), that every task is a sub-issue of its mission, that body Status = issue state =
project Status (`backlog` open + Todo · `in-progress` open + In Progress · `done` closed + Done; mission
`delivered` closed + Done), that every issue is on project 4, that no two in-progress tasks conflict and none waits
on an open dependency, the sections, and that a closed task has every Acceptance box ticked and an Outcome. **`start`, `task` (opening), `ship review-brief` and
`ship merge` refuse (exit 3) while the mission has findings.** Tasks close only through `task … --done`, missions
only through `ship merge` (never a hand close on GitHub or a bare `gh issue close`); both verify on GitHub that
the close and the Done status stuck. The session-start hook prints open missions and any findings (time-boxed;
offline it prints one line).

## Parallel tasks — the cli decides independence

User decision 2026-11-22: **independent tasks of a mission may be worked in parallel, one `step-dev` agent per
task** (each in the mission's worktree; the main session reviews each diff and commits by explicit path with that
task's `refs`). Independence is decided by the cli from the issue bodies, not by the model: two tasks are
independent when their Plan `files:` lines share no path (normalised sets; a directory entry covers everything
under it) and neither lists the other in its optional `Depends on:` line (`M<N>/T<k>` or `#<issue>`). A task
without a real `files:` line conflicts with everything and runs alone. `task M<N>/T<k>` refuses a conflicting task
or one with an open dependency, naming the task and the shared paths; such tasks run one after another. Review and
merge are unchanged: one `ship` per mission once all its tasks are done.

## Lanes

| Lane | Examples | Path |
|---|---|---|
| **Mission** (default) | every roadmap item, a new event or scenario, a refactor | the lifecycle above |
| **Gap / bug inside a mission** | something found while working | `mission-tracker add-task M<N> "…" --label gap` (a linked sub-issue) in the open mission |
| **No-mission** | a typo, a one-line fix the user wants straight on `main` | only when the user says so: commit on `main` with `[no-mission]` in the message, after one `spectra shot` |

## Branches and worktrees

| Branch | Role | Gets code from |
|---|---|---|
| `main` | the only long-lived branch; what `spectra build` publishes; never holds planning files | `ship merge` of missions (`git log --first-parent main` = one line per delivery); `[no-mission]` commits on the user's word |
| `mission/M<N>-<slug>` | one mission, off `main`: its tasks' commits; deleted when delivered | your commits, `main` merged in by `ship align` |

- Worktree of a branch: `.claude/worktrees/<branch with / → ->` (git-ignored). Enter with `EnterWorktree
  path=<worktree>`; `ExitWorktree action=keep` returns (never `remove`: `ship` removes it after the delivery).
  `uv run spectra …` works inside it (own `.venv`, own `shots/`). A proposed/planned mission's worktree can be
  dropped (`mission-tracker close-worktree M<N>`); the branch keeps the code and `start` re-opens it.
- The open missions are the open `mission` issues (`mission-tracker list`); delivered ones are closed issues with
  `**Status:** delivered (<sha>)` and the `Merge mission M<N>: …` commits on `main` (`list --delivered`).
- M1/M2/M3/M5/M7 branches still carry a stale `.claude/missions/` from before 2026-11-22: ignored by the tools,
  kept by `ship align`, always left out by `ship merge`.
- Concurrent sessions work on **different missions**; within one mission, parallel agents only on tasks the cli
  accepts as independent (see Parallel tasks), and one session commits.
- `git_guard` refuses: a commit on `main` without `[no-mission]`; `git merge / rebase / cherry-pick / revert /
  reset --hard` on `main`; a mission commit without `refs M<N>` of its own mission; `git add -A` / `.`; any force
  push. The clis run their own git (worktrees, merges); planning writes go to GitHub, not to commits.

## Commits

- Subject `<Area>: <what> (refs M<N>/T<k>)`, e.g. `Meters: area-weighted terrain surface mean (refs M1/T3)`; an
  extra `#<issue>` (`(refs M1/T6, #7)`) links the commit on GitHub; body: why + the verification numbers; the
  attribution trailer the session provides.
- Stage by explicit path; never commit `dist/`, `shots/`, screenshots or `.claude/settings.local.json`.
- Never force-push, rewrite pushed history or `--no-verify`.

## Definition of done

**Task**: Acceptance all ticked (in the issue) against real checks · `spectra timeline <ids>` 0 warnings, draw calls in the
Outcome · shots at 3 moments + 1 instrument view per touched scenario, exit 0, inspected · engine change → every
scenario · touched Python ruff/ty-clean (the hook reports) · Outcome says what was not verified · committed with
`refs` · closed by `task --done` (issue closed + Done, verified).

**Mission**: every task done (or the user accepted `--partial`) · reviewer `ok` for the head (physics-auditor `ok`
if events/spectrum changed) · README / docs/technical.md / CLAUDE.md / rules updated in the branch if a contract changed · Current
state updated · `check M<N>` clean · `ship merge` green (issue delivered, closed + Done) · pushed only on the user's
word.
