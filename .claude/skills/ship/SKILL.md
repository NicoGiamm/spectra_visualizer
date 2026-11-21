---
name: ship
description: "Deliver a spectra_visualizer mission into main, only on the user's word: reviewer gate (fresh-context agent fed `review-brief`), align with main, timeline gate, one --no-ff merge commit that leaves the mission's planning folder out, worktree + branch cleanup. Use for 'ship it', 'ship M4', 'is it ready to merge', 'merge the mission', 'partial delivery'."
argument-hint: "<status|align|review-brief|deliver|merge|cleanup> M<N>"
disable-model-invocation: true
allowed-tools: Bash(uv run .claude/skills/ship/cli.py status *) Bash(uv run .claude/skills/ship/cli.py review-brief *) Bash(uv run .claude/skills/ship/cli.py deliver *) Bash(uv run .claude/skills/ship/cli.py align *) Bash(git status *) Bash(git log *) Bash(git diff *)
---

# ship — a mission branch into main

Run as `uv run .claude/skills/ship/cli.py <command> M<N>` from any checkout. Arguments: `$ARGUMENTS`.
The lifecycle is `.claude/sdlc.md` stages 11–14.

## Hard rules

- Only on the user's word: when a mission's tasks are done, **ask** "ship M<N> now?" once; `merge` runs only after
  an explicit OK. Pushing is a separate OK.
- **No merge without an independent review** for the current head: the `reviewer` agent gets only the
  `review-brief` output; its block is recorded by `deliver`. A later commit (fixes, `align`) needs a new review.
  The user may override in words (`VERDICT: ok (owner override: <why>)`), never the agent on its own.
- `merge` refuses (exit 3): a mission that is not active, a dirty worktree, a branch that doesn't contain `main`
  (→ `align`), no `ok` for the head, open tasks without `--partial`, staged changes in the main checkout. Fails
  (exit 1): the timeline gate (`spectra timeline` in the worktree must print 0 warnings), a code conflict.
- The merge commit never contains `.claude/missions/`; the mission record stays in the merge's second parent.

## Commands

| Command | What it does |
|---|---|
| `status M<N>` | ahead/behind main, dirty, open tasks, recorded verdict vs head, the next step |
| `align M<N>` | merge the current main into the branch (keeps the branch's mission folder); conflicts → exit 1 |
| `review-brief M<N> [--out FILE]` | the reviewer's input: mission, tasks (Goal / Plan / Acceptance / Outcome), diff range, changed files, matching rules, reviewed head |
| `deliver M<N> --verdict-file FILE --reviewed-head SHA` | record FINDINGS / DOCS / VERDICT for that head (`.claude/logs/review-M<N>.json`, git-ignored) |
| `merge M<N> [--partial] [--keep]` | after the OK: gates → `git merge --no-ff --no-commit` → drop `.claude/missions/` → merge commit → remove worktree + branch (`--partial`/`--keep`: the branch continues) |
| `cleanup M<N>` | remove a fully delivered mission's worktree + branch (refused with undelivered commits) |

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
