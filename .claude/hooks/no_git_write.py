"""PreToolUse(Bash) for the step-dev agent: no git writes — the main session reviews and commits."""

import json
import re
import sys

cmd = json.load(sys.stdin).get("tool_input", {}).get("command", "")
if re.search(r"\bgit\s+(-C\s+\S+\s+)?(commit|push|add|reset|rebase|merge|checkout|switch|stash|tag|cherry-pick|revert)\b", cmd):
    print("step-dev never changes git state: leave the diff uncommitted for the main session to review.", file=sys.stderr)
    sys.exit(2)
