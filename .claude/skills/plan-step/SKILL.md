---
name: plan-step
description: Work the next (or a named) step of the spectra_visualizer roadmap .claude/plans/improvement-plan.md through the full SDLC loop — frame, explore, plan, implement (or delegate to one step-dev agent), verify, review, tick the plan with an honest progress note, commit. Use for "next step", "do 4.2", "continue the plan".
argument-hint: "[step id, e.g. 1.6] [--delegate]"
disable-model-invocation: true
---

# plan-step — one roadmap step, start to commit

Arguments: `$ARGUMENTS`. The loop is `.claude/sdlc.md`; this is its script for a plan step.

Open plan steps right now:

!`grep -nE '^- \[( |~)\] \*\*[0-9]' .claude/plans/improvement-plan.md | cut -c1-140`

## Hard rules

- One step per run. Steps in phase order unless the user named one; a `[~]` step is finished before a new one.
- Delegation (`--delegate`, or a large step): **one** `step-dev` agent at a time, on `main`, never in parallel or
  in worktrees; review its diff yourself before anything else.
- Never tick `[x]` on unverified work; never reword a step to fit what was built.

## Steps

1. **Frame.** Pick the step (argument, else the first open one above). Quote its full text and *Done when* back to
   the user in 2–4 lines. Note any open question (plan "Open questions") it depends on — if undecided, ask.
2. **Explore & baseline.** Read the files it touches; run `uv run spectra timeline <ids>` and keep the draw calls
   and warning count.
3. **Plan.** List files, new `SPECTRUM` processes (with sources), where new events go in `events()` (append — seeded
   `R`), the draw-call cost, the moments/bands that will prove it. Large step → enter plan mode and wait for approval.
4. **Implement** in the main session, or launch one `step-dev` with the step text quoted verbatim and the plan from
   step 3. Then read the whole diff (`git diff`) against the step text and check its claims (counts, frequencies,
   R order).
5. **Verify** with `/verify-scene <ids>` (all three scenarios if `engine/` changed). Fix and re-run until green.
6. **Review.** Launch the `reviewer` agent with: the step text, "uncommitted diff on main", the verify block.
   Events or `spectrum.js` changed → also `physics-auditor` on the touched events. Address findings; re-review if
   the fix was more than trivial.
7. **Record.** Tick `[x]` (or `[~]` + what remains), append `### <date> · <step> done|partial` with what changed,
   numbers (draw calls before → after, warnings), what wasn't verified, deviations.
8. **Commit** via `/ship` (it stops before push).

## Related

- `.claude/sdlc.md` — the loop, lanes, definition of done.
- `.claude/rules/plan.md` — how the plan is ticked and annotated.
- Agents: `step-dev`, `reviewer`, `physics-auditor`.
