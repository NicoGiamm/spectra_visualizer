# SDLC — how a change goes from idea to `main`

One maintainer, one branch (`main`), one roadmap (`.claude/plans/improvement-plan.md`), no CI and no
test suite: the **headless render** (`spectra shot`) and the **timeline physics check** (`spectra timeline`)
are the tests. The loop is Claude Code's recommended one: **explore → plan → implement → verify →
review → commit**, with a gate at each arrow. The skills drive it; this file is the one place it's defined.

## Roles

| Who | Owns |
|---|---|
| **User** | what gets built (the plan, open questions), approving plans for non-trivial work, every `git push` |
| **Main session** | the loop below: frames the step, plans, delegates or implements, verifies, reviews the diff, ticks the plan, commits |
| `step-dev` agent | implements **one** plan step on `main`, verifies it, never commits — one at a time, never in parallel |
| `reviewer` agent | fresh-context review of the diff before commit; read-only |
| `physics-auditor` agent | checks events / `spectrum.js` against real physics; read-only |

## Sizing — pick the lane first

| Lane | Examples | Path |
|---|---|---|
| **Trivial** | a typo, one tuning number, a comment | implement → `spectra shot` once → commit |
| **Standard** | one plan step, one new event, a bug fix | the full loop, in the main session or one `step-dev` |
| **Large** | a whole phase, an engine refactor across scenarios | plan mode, split into plan steps, then one `step-dev` per step **in sequence**, reviewing each before the next |

## The loop

| # | Stage | What happens | Exit gate |
|---|---|---|---|
| 1 | **Frame** | Name the unit of work: a plan step (quote its text and *Done when*) or a one-line goal. `/plan-step` picks the next unticked step. | A stated *done when* exists. |
| 2 | **Explore** | Read the code the step touches; the path-scoped rules in `.claude/rules/` load as files are opened. Broad searches go to an Explore agent. Record the **baseline**: `uv run spectra timeline <ids>` (draw calls, warnings). | Files to change and baseline numbers known. |
| 3 | **Plan** | Standard/large: plan mode. Name files, new `SPECTRUM` processes (with sources), seeded-`R` impact (where new events go in the list), draw-call cost, which moments/bands will prove it. | User approved (large) or plan stated (standard). |
| 4 | **Implement** | Smallest change that meets *done when*. Engine contracts: `Em`/`Rib`/`EmField`, `freq`, `S`, `R`. No drive-by refactors; out-of-scope findings become a note. | Code written, nothing outside the step. |
| 5 | **Verify** | `/verify-scene <ids>`: `spectra timeline` at **0 warnings** and draw calls vs baseline; `spectra shot` at `-t 5`, `30`, `54` plus an instrument view (`--bands` covering the touched bands), each exit 0; **look at the PNGs**. | All checks green, images show the intended effect. |
| 6 | **Review** | `reviewer` agent on the uncommitted diff, given only the step text. If events or `spectrum.js` changed: `physics-auditor` too. Fix or explicitly accept each finding. | `VERDICT: ok` (or the user accepts a `partial`). |
| 7 | **Record & commit** | Tick the plan (`[x]` / `[~]`), add a dated progress note with numbers and what was *not* verified. `/ship`: stage by explicit path, one commit per step. | Commit on `main`. |
| 8 | **Push** | Only when the user says so. | — |

## Commits

- Style from the history: `<Area>: <what> (plan X.Y)`, e.g. `Meters: area-weighted terrain surface mean (plan 1.3)`;
  `Plan: …` for plan-only edits. Body: why, and the verification numbers.
- Stage by explicit path, never `git add -A` / `.`; never commit `dist/`, `shots/` or screenshots.
- One step = one commit (a large step may checkpoint, each commit leaving `spectra shot` green).
- Never force-push, rewrite pushed history, or `--no-verify`.

## Branches and worktrees

Default: work on `main`. A worktree only when the user asks for one (e.g. a risky experiment); it is
merged back with `git merge --no-ff` as `Merge <topic> worktree: …` and removed afterwards (`git worktree
remove`, `git branch -d`). Never several agents in parallel worktrees (2026-11-21: they drifted from
the plan, see memory).

## Definition of done

- [ ] The step's *Done when* is met — checked against the plan text, not memory.
- [ ] `spectra timeline <touched ids>`: 0 warnings; draw calls within budget and noted.
- [ ] `spectra shot` at 3 moments + 1 instrument view per touched scenario: exit 0, images inspected.
- [ ] Shared engine change → every scenario timeline-checked and shot at least once.
- [ ] Reviewer verdict `ok`; physics-auditor `ok` if events/spectrum changed.
- [ ] Plan ticked, honest dated progress note; README/CLAUDE.md/rules updated if a contract changed.
- [ ] Committed by explicit path; not pushed unless asked.
