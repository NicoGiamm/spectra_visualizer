---
paths:
  - ".claude/plans/**"
---

# The roadmap — `.claude/plans/improvement-plan.md`

The plan is the single to-do list: phases → numbered steps with a *Done when*, an audit table, open
questions and dated progress notes. The lifecycle around it is `.claude/sdlc.md`.

## Guardrails

1. **MUST tick `[x]` only when the step's *Done when* is met and verified**; partial work is `[~]` with what is left.
   — on 2026-11-21 parallel agents overstated progress and the plan had to be re-audited.
2. **MUST append a dated progress note** (`### YYYY-MM-DD · <step> done|partial`) with what changed, the numbers
   (draw calls before → after, timeline warnings, meter peaks) and what was *not* verified or deviates from the
   step text.
3. **MUST NOT rewrite a step's wording to match what was built** — record the deviation in the note (as 1.1 does).
4. **Work steps in phase order**; a later-phase step needs the user's say-so.
5. **Decisions on open questions go under "Decisions so far"**, dated, with who decided.
