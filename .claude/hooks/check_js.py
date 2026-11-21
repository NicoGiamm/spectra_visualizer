"""PostToolUse(Edit|Write): flag engine-contract slips in the text just written to a .js file.

Checks only the new text (Edit new_string / Write content), so existing code doesn't nag:
  - dynamic import(): the bundler (build.py IMPORT_RE) only rewrites static import/export-from specifiers
  - `where: () => ... this` : arrow `this` is undefined in ES modules
  - Math.random: allowed only for visual-only jitter, never layout/timing (seeded R)
Exit 2 feeds the message back to Claude (the edit already happened); exit 0 = nothing to say.
"""

import json
import re
import sys

data = json.load(sys.stdin)
inp = data.get("tool_input", {})
path = inp.get("file_path", "")
if not path.endswith(".js"):
    sys.exit(0)
text = inp.get("new_string") or inp.get("content") or ""

notes = []
for n, line in enumerate(text.splitlines(), 1):
    if re.search(r"\bimport\s*\(", line):
        notes.append(f"line {n}: dynamic import() — the bundler can't inline it; use a static top-level import.")
    if re.search(r"\bwhere\s*:\s*\([^)]*\)\s*=>.*\bthis\b", line):
        notes.append(f"line {n}: `where` is an arrow reading `this` — make it a method: where() {{ ... }}.")
    if "Math.random" in line:
        notes.append(
            f"line {n}: Math.random — OK only for visual-only jitter (seeds, flicker); "
            "anything that places, sizes or times things must draw from the seeded R."
        )

if notes:
    print(f"check_js ({path}):\n- " + "\n- ".join(notes), file=sys.stderr)
    sys.exit(2)
