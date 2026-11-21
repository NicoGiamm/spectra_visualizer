---
name: verify-scene
description: Verify spectra_visualizer scenarios after a change — runs `spectra timeline` (physics check at 0 warnings, draw calls vs baseline) and headless `spectra shot`s at three moments plus an instrument view, then inspects the PNGs. Use after any edit to engine/ or scenarios/ (sdlc stage 5), or when asked to "check", "verify", "screenshot" or "does it still render".
argument-hint: "[scenario ids…] [--bands ir,micro] [--t 5,30,54]"
allowed-tools: Bash(uv run spectra *) Bash(git diff *) Bash(git status *) Read
---

# verify-scene — the test suite of this repo

There is no lint or unit test: these two commands are the checks. Arguments: `$ARGUMENTS`.

## Steps

1. **Scope.** Scenario ids from the arguments; if none, derive them from `git status --short`: a change under
   `scenarios/<id>/` → that id; anything under `engine/` or `src/` → all of `trail seaside city`.
   Bands for the instrument view: from `--bands`, else the bands the touched events/materials use
   (default `ir,micro`). Moments: from `--t`, else `5,30,54`.
2. **Timeline** — one call for all ids: `uv run spectra timeline <ids>`. Read the physics-check section: it must
   report **0 warnings**. Note scene draw calls per scenario and compare them with the baseline recorded at the task's start, else
   the last Outcome of the mission (`mission-tracker show M<N>/T<k>`). Flag an increase > 10 % or a city above ~400.
3. **Shots** — for each id, run in sequence (each takes ~30 s; use a 600000 ms timeout):
   - `uv run spectra shot <id> -t <m> -o <scratch>/<id>-t<m>.png` for each moment;
   - `uv run spectra shot <id> -t 30 --bands <bands> -o <scratch>/<id>-instr.png`.
   `<scratch>` is the session scratchpad directory if one is listed, else `shots/` (git-ignored). Each must exit 0;
   on exit 1 the printed console messages (shader compile log included) are the bug — report them verbatim.
4. **Look.** Open every PNG with Read. Check the intended change is actually visible at the moment it should be
   (and absent outside its `t0`–`t1`), nothing is black/blown out, labels sit on their objects, the instrument
   view shows the touched bands. A view that can't show the change → re-shoot with `--yaw/--pitch`.
5. **Report** the block below. Do not fix anything inside this skill; the session decides.

## What you return

```
VERIFY: <ids>
timeline: <id>: <n> warnings, draw calls t5/30/55 = <a/b/c> (baseline <x/y/z>)
shots: <id> -t <m>: exit <0|1> — <what the image shows>   (one line each)
issues: <list, or "none">
```

## Related

- `.claude/sdlc.md` stage 5 and the definition of done.
- `.claude/rules/tooling.md` for how `shot` / `timeline` work and their limits (SwiftShader, CDN).
