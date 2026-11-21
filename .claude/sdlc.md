# SDLC — how a change goes from idea to `main`

One maintainer, one long-lived branch (`main`), no CI and no test suite: the **headless render**
(`spectra shot`) and the **timeline physics check** (`spectra timeline`) are the tests. Planned work is
**missions**: one branch `mission/M<N>-<slug>` + one worktree each, holding the mission's plan as files
(`.claude/missions/M<N>-<slug>/`) **only on that branch** — `main` never carries planning files. Tasks are
commits on the branch. A mission reaches `main` as one `--no-ff` merge commit, after a fresh-context review and
the user's word, with its planning folder left out.

Adapter values (names, paths, the mission/task standard): `.claude/sdlc.toml`. Store conventions:
`.claude/rules/missions.md`. Commands: `/mission-tracker`, `/ship`, `/verify-scene`.

## Roles

| Who | Owns |
|---|---|
| **User** | which missions exist (approves proposals), decisions, "ship now?", every `git push` |
| **Main session** | the lifecycle below: proposes, starts, works tasks (or delegates), verifies, commits in the worktree, gets the review, ships after the OK |
| `step-dev` agent | implements **one** task in the mission's worktree and verifies it; never commits — one at a time, never in parallel |
| `reviewer` agent | fresh-context review of the whole mission diff before a merge; read-only |
| `physics-auditor` agent | checks events / `spectrum.js` against real physics; read-only |

## The lifecycle

```
propose ─▶ proposed ─user OK─▶ planned ─start─▶ active ─┬─ per task: open → explore → plan → implement → verify → commit → done
(branch + worktree  (approve)            (EnterWorktree)│
 off main)                                              └─ all done ─▶ "ship now?" ─▶ review-brief → reviewer → deliver
                                                           ─▶ user OK ─▶ ship merge: --no-ff into main WITHOUT .claude/missions/,
                                                              worktree + branch removed (the record stays in the merge's 2nd parent)
```

| # | Stage | Command | Exit gate |
|---|---|---|---|
| 1 | **Propose**: opens `mission/M<N>-<slug>` off `main` + its worktree; fill Problem / Scope / Delivery and the tasks (Goal, Plan `files:`, Acceptance) there, commit on the branch | `mission-tracker propose "<title>"`, `add-task M<N> "<title>"` | shown to the user |
| 2 | **Approve** — only after the user's OK | `mission-tracker approve M<N>` | strict standard check (no template placeholders); status `planned` |
| 3 | **Start** (a planned mission without a worktree gets one back) | `mission-tracker start M<N>`, then `EnterWorktree path=<worktree>` | session works inside the worktree; `ship align` if `main` moved |
| 4 | **Open a task** — one at a time | `mission-tracker task M<N>/T<k>` | Plan has real `files:`, Acceptance is checkable |
| 5 | **Explore** the files; record the baseline `spectra timeline <ids>`; broad searches → Explore agent | — | baseline numbers known |
| 6 | **Plan**: files, new `SPECTRUM` processes (sourced), seeded-`R` impact, draw-call cost, the moments/bands that prove it. Large task → plan mode, user approves | — | plan stated / approved |
| 7 | **Implement** the smallest change that meets Acceptance — main session or one `step-dev` | — | nothing outside the task's Plan (else a `gap` task) |
| 8 | **Verify** | `/verify-scene <ids>` | timeline 0 warnings; shots at 5/30/54 + instrument view exit 0; PNGs inspected |
| 9 | **Commit** in the worktree, by explicit path, `(refs M<N>/T<k>)`; checkpoint commits allowed | `git commit` (git_guard checks) | — |
| 10 | **Close the task**: tick Acceptance, write the evidence (what changed, numbers, not verified) | `mission-tracker task M<N>/T<k> --done --evidence <file>` | refused unless every item is ticked |
| 11 | **Ship?** When the tasks are done, ask the user once: "ship M<N> now?" | — | the user's word |
| 12 | **Review** the whole mission diff | `ship review-brief M<N>` → `reviewer` (+ `physics-auditor` if events/spectrum changed) → `ship deliver M<N> --verdict-file … --reviewed-head …` | `VERDICT: ok` for the current head (a later commit needs a new review) |
| 13 | **Merge** after the user's OK | `ship align M<N>` if `main` moved (then re-review), `ship merge M<N>` | active mission · reviewer `ok` @ head · branch contains `main` · timeline gate 0 warnings · `--no-ff` merge without `.claude/missions/` · worktree + branch removed |
| 14 | **Push** | only when the user says so | — |

**Partial delivery** (the user wants part of a mission on `main` now): `ship merge M<N> --partial` — the branch and
its folder continue; `ship align M<N>` before new work (align always keeps the branch's own mission folder).

## Lanes

| Lane | Examples | Path |
|---|---|---|
| **Mission** (default) | every roadmap item, a new event or scenario, a refactor | the lifecycle above |
| **Gap / bug inside a mission** | something found while working | `mission-tracker add-task M<N> "…" --label gap` in the open mission |
| **No-mission** | a typo, a one-line fix the user wants straight on `main` | only when the user says so: commit on `main` with `[no-mission]` in the message, after one `spectra shot` |

## Branches and worktrees

| Branch | Role | Gets code from |
|---|---|---|
| `main` | the only long-lived branch; what `spectra build` publishes; never holds `.claude/missions/` | `ship merge` of missions (`git log --first-parent main` = one line per delivery); `[no-mission]` commits on the user's word |
| `mission/M<N>-<slug>` | one mission, off `main`: its planning folder + its tasks' commits; deleted when delivered | your commits, `main` merged in by `ship align` |

- Worktree of a branch: `.claude/worktrees/<branch with / → ->` (git-ignored). Enter with `EnterWorktree
  path=<worktree>`; `ExitWorktree action=keep` returns (never `remove`: `ship` removes it after the delivery).
  `uv run spectra …` works inside it (own `.venv`, own `shots/`). A proposed/planned mission's worktree can be
  dropped (`mission-tracker close-worktree M<N>`); the branch keeps everything and `start` re-opens it.
- The open missions are the `mission/*` branches (`mission-tracker list`); delivered ones are the `Merge mission
  M<N>: …` commits on `main` (`list --delivered`); a delivered mission's plan: `git show <merge>^2:.claude/missions/`.
- Concurrent sessions work on **different missions**; within one mission one session or agent at a time.
- `git_guard` refuses: a commit on `main` without `[no-mission]`; `git merge / rebase / cherry-pick / revert /
  reset --hard` on `main`; a mission commit without `refs M<N>` of its own mission; `git add -A` / `.`; any force
  push. The clis run their own git (merges, bookkeeping commits on the branch).

## Commits

- Subject `<Area>: <what> (refs M<N>/T<k>)`, e.g. `Meters: area-weighted terrain surface mean (refs M1/T3)`; body:
  why + the verification numbers; the attribution trailer the session provides.
- Stage by explicit path; never commit `dist/`, `shots/`, screenshots or `.claude/settings.local.json`.
- Never force-push, rewrite pushed history or `--no-verify`.

## Definition of done

**Task**: Acceptance all ticked against real checks · `spectra timeline <ids>` 0 warnings, draw calls in the
Outcome · shots at 3 moments + 1 instrument view per touched scenario, exit 0, inspected · engine change → every
scenario · Outcome says what was not verified · committed with `refs`.

**Mission**: every task done (or the user accepted `--partial`) · reviewer `ok` for the head (physics-auditor `ok`
if events/spectrum changed) · README / CLAUDE.md / rules updated in the branch if a contract changed · Current
state updated · `ship merge` green · pushed only on the user's word.
