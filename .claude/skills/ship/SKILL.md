---
name: ship
description: Close a unit of work in spectra_visualizer — confirm verification and review happened, stage by explicit path, commit on main in the repo's message style with the plan step reference, and push only if the user says so. Use for "commit", "ship it", "wrap up this step".
argument-hint: "[commit subject] [--push]"
disable-model-invocation: true
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git add *) Bash(git commit *)
---

# ship — commit (and maybe push) a verified change

Arguments: `$ARGUMENTS`.

Working tree now:

!`git status --short`

## Hard rules

- **No commit without green verification and a review** for standard/large work (`.claude/sdlc.md` lanes): a
  `/verify-scene` block with exit 0 everywhere and 0 timeline warnings, and a `reviewer` `VERDICT: ok` (or a
  `partial` the user accepted) — both for the current diff. Missing → run them first, don't skip.
- Stage by explicit path. Never `git add -A`, `git add .`, `git commit -a`; never stage `dist/`, `shots/`, PNGs,
  `.claude/settings.local.json`.
- `git push` only when the user asked in this conversation for this change (or passed `--push`). Never force.

## Steps

1. Check the gates above against what happened in this session. Trivial lane: one `spectra shot` exit 0 is enough.
2. If this is a plan step: the plan is ticked and has a dated progress note in the same commit.
3. `git diff --stat` — every file belongs to this unit of work; anything else stays unstaged and is mentioned.
4. Stage the files by path; commit with:
   - subject `<Area>: <what> (plan X.Y)` — `git log --oneline -15` for the house style; `Plan: …` for plan-only;
   - body: why, and the verification numbers (draw calls before → after, warnings, moments shot);
   - the attribution trailer the session provides.
5. Report the commit hash and subject. Ask "push now?" unless `--push` was given.

## Related

- `.claude/sdlc.md` stages 7–8, commit conventions, definition of done.
