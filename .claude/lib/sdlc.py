"""Shared core of the SDLC: config, the GitHub-backed mission/task store, git and worktrees.

Used by `.claude/skills/mission-tracker/cli.py`, `.claude/skills/ship/cli.py` and the session hook. Values come
from `.claude/sdlc.toml`; the flow is `.claude/sdlc.md`; the conventions `.claude/rules/missions.md`.

**Planning lives in GitHub Issues** (user decision 2026-11-22). A mission is a parent issue `M<N> — <title>`
(label `mission`), a task is its sub-issue `M<N>/T<k> — <title>` (label `task`), both on the user project
(Status Todo / In Progress / Done). The body starts with a marker comment and one header line
(`**Branch:** … · **Status:** … · **Created:** …` or `**Mission:** #… · **Status:** … · **Started:** … ·
**Completed:** …`), then `## ` sections. Code still lives on one branch + worktree per mission; nothing of the
plan is in the repository (a stale `.claude/missions/` on an old branch is ignored and never reaches main).

Reads are one GraphQL query per process (cached in memory only). Writes go through `gh` with retries for
transient errors; with `set_dry_run(True)` they print the call (and a body diff) instead of running it.
"""

from __future__ import annotations

import datetime as dt
import difflib
import json
import os
import re
import shlex
import subprocess
import time
import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


class Refused(Exception):
    """A gate said no (exit 3): the state is fine, the request is not allowed now."""

    code = 3


class Failed(Exception):
    """Something broke (exit 1): a git or GitHub error, a conflict, a red check."""

    code = 1


TRAILER = "\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

# ---------------------------------------------------------------- shell / git


def run(args: list[str], cwd: Path | None = None, check: bool = True) -> str:
    p = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if check and p.returncode:
        raise Failed(f"`{' '.join(args)}` failed:\n{(p.stderr or p.stdout).strip()}")
    return p.stdout.strip()


def rc(args: list[str], cwd: Path | None = None) -> int:
    return subprocess.run(args, cwd=cwd, capture_output=True).returncode


def git(*args: str, cwd: Path | None = None, check: bool = True) -> str:
    return run(["git", *args], cwd=cwd, check=check)


def main_root() -> Path:
    """The main checkout (the parent of the shared .git), from any worktree."""
    return Path(git("rev-parse", "--path-format=absolute", "--git-common-dir")).parent.resolve()


def here_root() -> Path:
    return Path(git("rev-parse", "--show-toplevel")).resolve()


def today() -> str:
    return dt.date.today().isoformat()


def worktrees() -> dict[str, Path]:
    """branch name -> worktree path, for every worktree with a branch checked out."""
    out, path = {}, None
    for line in git("worktree", "list", "--porcelain", cwd=main_root()).splitlines():
        if line.startswith("worktree "):
            path = Path(line[9:]).resolve()
        elif line.startswith("branch refs/heads/") and path:
            out[line[18:]] = path
    return out


def branch_exists(branch: str) -> bool:
    return bool(git("branch", "--list", branch, cwd=main_root()))


def head(cwd: Path) -> str:
    return git("rev-parse", "HEAD", cwd=cwd)


def dirty(cwd: Path) -> list[str]:
    return [line for line in git("status", "--porcelain", cwd=cwd).splitlines() if line.strip()]


def ahead_behind(branch: str, base: str) -> tuple[int, int]:
    behind, ahead = git("rev-list", "--left-right", "--count", f"{base}...{branch}", cwd=main_root()).split()
    return int(ahead), int(behind)


# ---------------------------------------------------------------- config


@dataclass
class Config:
    root: Path
    raw: dict

    @property
    def main(self) -> str:
        return self.raw["repo"]["main_branch"]

    @property
    def prefix(self) -> str:
        return self.raw["branches"]["mission_prefix"]

    @property
    def worktrees_dir(self) -> Path:
        return self.root / self.raw["branches"]["worktrees_dir"]

    @property
    def legacy_rel(self) -> str:
        """The retired file store: ignored on old branches, always left out of merge commits."""
        return self.raw["store"]["legacy_planning_dir"]

    @property
    def templates(self) -> Path:
        return self.root / self.raw["store"]["templates_dir"]

    @property
    def state_dir(self) -> Path:
        return self.root / self.raw["ship"]["state_dir"]

    @property
    def gh(self) -> dict:
        return self.raw["github"]

    @property
    def repo(self) -> str:
        return self.gh["repo"]

    def label(self, kind: str) -> str:
        return self.gh["labels"][kind]

    def project_status(self, kind: str, status: str) -> str:
        """The project Status option for a mission/task body status."""
        return self.gh["project_status"][kind][status]

    def std(self, kind: str) -> dict:
        return self.raw["standard"][kind]

    def worktree_of(self, branch: str) -> Path:
        return self.worktrees_dir / branch.replace("/", "-")


_CFG: Config | None = None


def config() -> Config:
    global _CFG
    if _CFG is None:
        root = main_root()
        _CFG = Config(root, tomllib.loads((root / ".claude" / "sdlc.toml").read_text(encoding="utf-8")))
    return _CFG


# ---------------------------------------------------------------- dry run

DRY_RUN = False
WOULD_REFUSE: list[str] = []  # gates a dry run walked past; the clis exit 3 when non-empty


def set_dry_run(on: bool) -> None:
    global DRY_RUN
    DRY_RUN = on


def say(msg: str) -> None:
    print(f"DRY-RUN  {msg}" if DRY_RUN else msg)


def gate(ok: bool, msg: str) -> None:
    """Refuse when not ok — in a dry run only report it, so the rest of the intended calls still print."""
    if ok:
        return
    if DRY_RUN:
        print(f"DRY-RUN  (would be REFUSED) {msg}")
        WOULD_REFUSE.append(msg)
        return
    raise Refused(msg)


# ---------------------------------------------------------------- gh

TRANSIENT = re.compile(
    r"HTTP 5\d\d|HTTP 429|HTTP 408|timed? ?out|timeout|connection (reset|refused)|could not resolve host|"
    r"TLS handshake|unexpected EOF|secondary rate limit|submitted too quickly|Could not resolve to a node|"
    r"temporarily|try again|Something went wrong",
    re.I,
)
GH_TIMEOUT = 60


def gh(args: list[str], stdin: str | None = None, attempts: int = 4) -> str:
    """Run `gh`; retry transient GitHub errors (1, 2, 4 s back-off); Failed with a readable message otherwise."""
    env = {**os.environ, "GH_PROMPT_DISABLED": "1", "GH_NO_UPDATE_NOTIFIER": "1"}
    err = ""
    for i in range(attempts):
        try:
            p = subprocess.run(["gh", *args], capture_output=True, text=True, input=stdin, timeout=GH_TIMEOUT, env=env)
        except FileNotFoundError:
            raise Failed("the GitHub CLI `gh` is not installed or not on PATH (https://cli.github.com)") from None
        except subprocess.TimeoutExpired:
            err = f"timed out after {GH_TIMEOUT} s"
        else:
            if p.returncode == 0:
                return p.stdout
            err = (p.stderr or p.stdout).strip()
        if i < attempts - 1 and TRANSIENT.search(err):
            time.sleep(2**i)
            continue
        break
    shown = " ".join(a if len(a) < 80 and "\n" not in a else a.split("=", 1)[0] + "=…" for a in args)
    raise Failed(
        f"`gh {shown}` failed: {err}\n"
        "(offline? `gh auth status`; project writes need the `project` scope: `gh auth refresh -s project`)"
    )


def gh_json(args: list[str], stdin: str | None = None) -> Any:
    out = gh(args, stdin)
    return json.loads(out) if out.strip() else None


def graphql(query: str, **variables: str | int) -> dict:
    args = ["api", "graphql", "-f", f"query={query}"]
    for k, v in variables.items():
        args += ["-F" if isinstance(v, int) else "-f", f"{k}={v}"]
    data = gh_json(args)
    if not isinstance(data, dict) or data.get("errors"):
        raise Failed(f"GitHub GraphQL error: {data.get('errors') if isinstance(data, dict) else data}")
    return data["data"]


def _show_call(args: list[str], payload: dict | None = None) -> None:
    line = "gh " + shlex.join(args)
    if payload is not None:
        short = {k: (f"<{len(v)} chars>" if isinstance(v, str) and len(v) > 60 else v) for k, v in payload.items()}
        line += f"  <<< {json.dumps(short, ensure_ascii=False)}"
    print(f"DRY-RUN  {line}")


def _show_diff(old: str, new: str, label: str) -> None:
    diff = list(
        difflib.unified_diff(old.splitlines(), new.splitlines(), f"{label} (now)", f"{label} (new)", n=0, lineterm="")
    )
    for line in diff[2:]:
        print(f"DRY-RUN    {line}")


# ---------------------------------------------------------------- the store: issues

ISSUES_QUERY = """
query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, after: $after, labels: [%s], orderBy: {field: CREATED_AT, direction: ASC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id databaseId number title state stateReason body url
        labels(first: 20) { nodes { name } }
        parent { number }
        subIssues(first: 100) { nodes { number } }
        projectItems(first: 10) {
          nodes { id project { id } fieldValueByName(name: "%s") {
            ... on ProjectV2ItemFieldSingleSelectValue { name } } }
        }
      }
    }
  }
}
"""


@dataclass
class Issue:
    number: int
    node_id: str
    db_id: int
    title: str
    state: str  # OPEN | CLOSED
    state_reason: str
    body: str
    url: str
    labels: list[str]
    parent: int | None
    subs: list[int]
    item_id: str | None  # the item on our project, if any
    project_status: str | None

    @property
    def open(self) -> bool:
        return self.state == "OPEN"


_ISSUES: dict[int, Issue] | None = None


def include_test() -> bool:
    """Issues labelled [github] test_label are invisible unless SPECTRA_TEST_ISSUES=1 (throw-away harness tests)."""
    return os.environ.get("SPECTRA_TEST_ISSUES") == "1"


def issues(refresh: bool = False) -> dict[int, Issue]:
    """number -> Issue for every issue labelled mission or task (one paginated GraphQL query, cached per process)."""
    global _ISSUES
    if _ISSUES is not None and not refresh:
        return _ISSUES
    cfg = config()
    owner, name = cfg.repo.split("/")
    labels = ", ".join(json.dumps(cfg.label(k)) for k in ("mission", "task"))
    query = ISSUES_QUERY % (labels, cfg.gh["status_field"])
    out: dict[int, Issue] = {}
    after = ""
    test = cfg.gh.get("test_label", "test")
    while True:
        vars_: dict[str, str | int] = {"owner": owner, "name": name}
        if after:
            vars_["after"] = after
        page = graphql(query, **vars_)["repository"]["issues"]
        for n in page["nodes"]:
            labs = [x["name"] for x in n["labels"]["nodes"]]
            if test in labs and not include_test():
                continue
            item = next((x for x in n["projectItems"]["nodes"] if x["project"]["id"] == cfg.gh["project_id"]), None)
            out[n["number"]] = Issue(
                number=n["number"],
                node_id=n["id"],
                db_id=n["databaseId"],
                title=n["title"],
                state=n["state"],
                state_reason=n["stateReason"] or "",
                body=(n["body"] or "").replace("\r\n", "\n"),
                url=n["url"],
                labels=labs,
                parent=(n["parent"] or {}).get("number"),
                subs=[s["number"] for s in n["subIssues"]["nodes"]],
                item_id=item["id"] if item else None,
                project_status=((item or {}).get("fieldValueByName") or {}).get("name"),
            )
        if not page["pageInfo"]["hasNextPage"]:
            break
        after = page["pageInfo"]["endCursor"]
    _ISSUES = out
    return out


# ---------------------------------------------------------------- bodies: header line + ## sections

MARK_RE = re.compile(r"<!--\s*spectra:(mission|task)\s+(M\d+(?:/T\d+)?)\s*-->")
HEADER_RE = re.compile(r"\*\*([A-Za-z ]+):\*\*\s*(.*?)\s*(?=·\s*\*\*[A-Za-z ]+:\*\*|$)")
EMPTY = "—"


def marker(body: str) -> tuple[str, str] | None:
    m = MARK_RE.search(body.split("\n## ", 1)[0])
    return (m.group(1), m.group(2)) if m else None


def _header_line(body: str) -> int | None:
    for i, line in enumerate(body.split("\n")):
        if line.startswith("## "):
            return None
        if line.startswith("**") and HEADER_RE.search(line):
            return i
    return None


def header(body: str) -> dict[str, str]:
    """The header line's fields, cleaned: backticks stripped, `—` -> ''."""
    i = _header_line(body)
    if i is None:
        return {}
    raw = HEADER_RE.findall(body.split("\n")[i])
    return {k.strip(): ("" if v.strip() == EMPTY else v.strip().strip("`")) for k, v in raw}


def _fmt(key: str, value: str) -> str:
    if not value:
        return EMPTY
    if key == "Branch" and not value.startswith("`"):
        return f"`{value}`"
    return value


def set_header(body: str, updates: dict[str, str]) -> str:
    i = _header_line(body)
    if i is None:
        raise Failed("issue body has no `**Key:** value · …` header line")
    lines = body.split("\n")
    fields = {k.strip(): v.strip() for k, v in HEADER_RE.findall(lines[i])}
    fields.update(updates)
    lines[i] = " · ".join(f"**{k}:** {_fmt(k, v)}" for k, v in fields.items())
    return "\n".join(lines)


def sections(body: str) -> list[tuple[str, str]]:
    """[(heading, content)] for every `## ` heading, in order (the marker/header preamble is dropped)."""
    parts = re.split(r"^## +(.+?)\s*$", body, flags=re.M)
    return [(parts[i].strip(), parts[i + 1]) for i in range(1, len(parts), 2)]


def get_section(body: str, title: str) -> str:
    for t, c in sections(body):
        if t == title:
            return c.strip()
    return ""


def set_section(body: str, title: str, content: str) -> str:
    pat = re.compile(rf"(^## +{re.escape(title)}[ \t]*\n)(.*?)(?=^## |\Z)", re.S | re.M)
    if not pat.search(body):
        return body.rstrip() + f"\n\n## {title}\n\n{content.strip()}\n"
    return pat.sub(lambda m: f"{m.group(1)}\n{content.strip()}\n\n", body, count=1).rstrip() + "\n"


def append_line(body: str, title: str, line: str) -> str:
    """Append `- <today> · line` to a section, dropping template comment lines."""
    kept = "\n".join(x for x in get_section(body, title).splitlines() if not x.lstrip().startswith("<!--"))
    return set_section(body, title, f"{kept}\n- {today()} · {line}".strip())


def checklist(text: str) -> list[tuple[bool, str]]:
    return [
        (m.group(1).lower() == "x", m.group(2).strip()) for m in re.finditer(r"^\s*- \[( |x|X)\] (.+)$", text, re.M)
    ]


def is_placeholder(text: str) -> bool:
    t = text.strip()
    return not t or (t.startswith("<") and not t.startswith("<!--"))


# ---------------------------------------------------------------- missions and tasks

MISSION_TITLE = re.compile(r"^M(\d+)\s+—\s+(.+)$")
TASK_TITLE = re.compile(r"^M(\d+)/T(\d+)\s+—\s+(.+)$")


@dataclass
class Task:
    mission: int
    num: int
    title: str
    issue: Issue

    @property
    def ref(self) -> str:
        return f"M{self.mission}/T{self.num}"

    @property
    def body(self) -> str:
        return self.issue.body

    @property
    def meta(self) -> dict[str, str]:
        return header(self.issue.body)

    @property
    def status(self) -> str:
        return self.meta.get("Status", "")

    @property
    def labels(self) -> list[str]:
        return [x for x in self.issue.labels if x != config().label("task")]


@dataclass
class Mission:
    num: int
    title: str
    issue: Issue
    tasks: list[Task] = field(default_factory=list)
    worktree: Path | None = None

    @property
    def ref(self) -> str:
        return f"M{self.num}"

    @property
    def body(self) -> str:
        return self.issue.body

    @property
    def meta(self) -> dict[str, str]:
        return header(self.issue.body)

    @property
    def status(self) -> str:
        """proposed | planned | active | delivered (the sha in `delivered (<sha>)` is dropped)."""
        return self.meta.get("Status", "").split(" ", 1)[0]

    @property
    def branch(self) -> str:
        return self.meta.get("Branch", "")

    @property
    def wt(self) -> Path:
        """The worktree, for operations that need one (refused when the mission has none open)."""
        if self.worktree is None:
            raise Refused(f"{self.ref} has no worktree open: `mission-tracker open {self.ref}` (or `start`)")
        return self.worktree

    def task(self, num: int) -> Task:
        for t in self.tasks:
            if t.num == num:
                return t
        raise Refused(f"{self.ref} has no task T{num}")


def missions(include_closed: bool = False, refresh: bool = False) -> list[Mission]:
    iss = issues(refresh)
    wts = worktrees()
    ml, tl = config().label("mission"), config().label("task")
    out = []
    for i in iss.values():
        mm = MISSION_TITLE.match(i.title)
        if ml not in i.labels or not mm or (not include_closed and not i.open):
            continue
        m = Mission(int(mm.group(1)), mm.group(2).strip(), i)
        m.worktree = wts.get(m.branch) if m.branch else None
        for c in iss.values():
            tm = TASK_TITLE.match(c.title)
            if tl in c.labels and tm and (c.parent == i.number or c.number in i.subs):
                m.tasks.append(Task(int(tm.group(1)), int(tm.group(2)), tm.group(3).strip(), c))
        m.tasks.sort(key=lambda t: t.num)
        out.append(m)
    return sorted(out, key=lambda m: m.num)


def mission_branches() -> list[str]:
    cfg = config()
    out = git("for-each-ref", "--format=%(refname:short)", f"refs/heads/{cfg.prefix}", cwd=cfg.root).splitlines()
    return [b for b in out if b]


def delivered() -> list[tuple[int, str, str]]:
    """(mission number, merge sha, subject) of every `Merge mission M<N>: …` on main's first-parent history."""
    cfg = config()
    out = []
    for line in git(
        "log", "--first-parent", "--format=%h %s", "--grep=^Merge mission M", cfg.main, cwd=cfg.root
    ).splitlines():
        sha, _, subj = line.partition(" ")
        m = re.match(r"Merge mission M(\d+)", subj)
        if m:
            out.append((int(m.group(1)), sha, subj))
    return out


BRANCH_RE = re.compile(r"^M(\d+)-(.+)$")


def next_number() -> int:
    cfg = config()
    nums = [m.num for m in missions(include_closed=True)] + [n for n, _, _ in delivered()]
    nums += [int(x) for x in cfg.raw["store"].get("reserved_numbers", [])]
    for b in mission_branches():
        mm = BRANCH_RE.match(b[len(cfg.prefix) :])
        if mm:
            nums.append(int(mm.group(1)))
    return max(nums, default=-1) + 1


REF_RE = re.compile(r"^\s*M?(\d+)(?:\s*[/.]\s*T?(\d+))?\s*$", re.I)


def parse_ref(ref: str) -> tuple[int, int | None]:
    m = REF_RE.match(ref)
    if not m:
        raise Refused(f"not a mission/task reference: {ref!r} (use M4, M4/T1, 4.1 or #7)")
    return int(m.group(1)), int(m.group(2)) if m.group(2) else None


def find(ref: str) -> tuple[Mission, Task | None]:
    """A mission (open or delivered) and optionally one of its tasks, by `M<N>[/T<k>]` or issue `#<n>`."""
    ms = missions(include_closed=True)
    if ref.strip().startswith("#"):
        n = int(ref.strip()[1:])
        for m in ms:
            if m.issue.number == n:
                return m, None
            for t in m.tasks:
                if t.issue.number == n:
                    return m, t
        raise Refused(f"issue #{n} is not a mission or task of a mission")
    n, k = parse_ref(ref)
    for m in ms:
        if m.num == n:
            return m, (m.task(k) if k is not None else None)
    raise Refused(f"no mission issue `M{n} — …` (label {config().label('mission')}) in {config().repo}")


def find_open(ref: str) -> tuple[Mission, Task | None]:
    m, t = find(ref)
    if not m.issue.open or m.status == "delivered":
        raise Refused(f"{m.ref} is {m.meta.get('Status') or 'closed'}: {m.issue.url}")
    return m, t


def ensure_worktree(m: Mission) -> Mission:
    """Open (or reuse) the mission's worktree; creates the branch off main if it is missing."""
    if m.worktree:
        return m
    cfg = config()
    if not m.branch:
        raise Failed(f"{m.ref}'s issue has no **Branch:** in its header")
    wt = cfg.worktree_of(m.branch)
    args = ["worktree", "add", "-q", str(wt), m.branch]
    if not branch_exists(m.branch):
        args = ["worktree", "add", "-q", "-b", m.branch, str(wt), cfg.main]
    if DRY_RUN:
        say("git " + shlex.join(args))
    else:
        wt.parent.mkdir(parents=True, exist_ok=True)
        git(*args, cwd=cfg.root)
    m.worktree = wt.resolve()
    return m


def render(template: str, **kw: str) -> str:
    text = (config().templates / template).read_text(encoding="utf-8")
    for k, v in kw.items():
        text = text.replace("{" + k + "}", v)
    return text


def template_placeholders(template: str) -> list[str]:
    """Every `<…>` placeholder of a template (not comments, not `<N>`-style tokens, not the Outcome note)."""
    text = strip_comments((config().templates / template).read_text(encoding="utf-8"))
    text = re.sub(r"^## Outcome.*", "", text, flags=re.S | re.M)
    return [p for p in re.findall(r"<[^<>\n]{4,}>", text) if "{" not in p]


def strip_comments(text: str) -> str:
    return re.sub(r"<!--.*?-->", "", text, flags=re.S)


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40].strip("-")


# ---------------------------------------------------------------- writes (all through gh; dry-run aware)

_FAKE = iter(range(90001, 99999))


def create_issue(title: str, body: str, labels: list[str]) -> Issue:
    payload = {"title": title, "body": body, "labels": labels}
    args = ["api", "-X", "POST", f"repos/{config().repo}/issues", "--input", "-"]
    if DRY_RUN:
        _show_call(args, payload)
        n = next(_FAKE)
        return Issue(
            n, f"<node of new #{n}>", 0, title, "OPEN", "", body, f"<url of new #{n}>", labels, None, [], None, None
        )
    d = gh_json(args, json.dumps(payload))
    i = Issue(d["number"], d["node_id"], d["id"], title, "OPEN", "", body, d["html_url"], labels, None, [], None, None)
    if _ISSUES is not None:
        _ISSUES[i.number] = i
    return i


def edit_issue(i: Issue, *, body: str | None = None, state: str | None = None, reason: str | None = None) -> None:
    """PATCH body and/or state (`closed` + reason `completed` | `not_planned`, or `open`) in one call."""
    payload: dict[str, str] = {}
    if body is not None and body != i.body:
        payload["body"] = body
    if state is not None:
        payload["state"] = state
        if reason:
            payload["state_reason"] = reason
    if not payload:
        return
    args = ["api", "-X", "PATCH", f"repos/{config().repo}/issues/{i.number}", "--input", "-"]
    if DRY_RUN:
        _show_call(args, payload)
        if "body" in payload:
            _show_diff(i.body, payload["body"], f"#{i.number}")
    else:
        gh(args, json.dumps(payload))
    if body is not None:
        i.body = body
    if state is not None:
        i.state = state.upper()
        i.state_reason = (reason or "").upper()


def comment(i: Issue, text: str) -> None:
    args = ["api", "-X", "POST", f"repos/{config().repo}/issues/{i.number}/comments", "--input", "-"]
    if DRY_RUN:
        _show_call(args, {"body": text})
        return
    gh(args, json.dumps({"body": text}))


def add_sub_issue(parent: Issue, child: Issue) -> None:
    args = ["api", "-X", "POST", f"repos/{config().repo}/issues/{parent.number}/sub_issues"]
    args += ["-F", f"sub_issue_id={child.db_id}"]
    if DRY_RUN:
        _show_call(args)
    else:
        gh(args)
    child.parent = parent.number
    parent.subs.append(child.number)


def sub_issue_numbers(parent: Issue) -> list[int]:
    """Re-read the parent's sub-issues from GitHub (REST)."""
    data = gh_json(["api", f"repos/{config().repo}/issues/{parent.number}/sub_issues", "--paginate"])
    return [x["number"] for x in data or []]


def delete_issue(i: Issue) -> None:
    args = ["issue", "delete", str(i.number), "-R", config().repo, "--yes"]
    if DRY_RUN:
        _show_call(args)
        return
    gh(args)


_STATUS_FIELD: tuple[str, dict[str, str]] | None = None


def status_field() -> tuple[str, dict[str, str]]:
    """(field id, option name -> option id) of the project's Status field, looked up once per process."""
    global _STATUS_FIELD
    if _STATUS_FIELD is None:
        q = """query($p: ID!, $f: String!) { node(id: $p) { ... on ProjectV2 {
          field(name: $f) { ... on ProjectV2SingleSelectField { id options { id name } } } } } }"""
        cfg = config()
        f = graphql(q, p=cfg.gh["project_id"], f=cfg.gh["status_field"])["node"]["field"]
        if not f:
            raise Failed(f"project {cfg.gh['project_id']} has no single-select field {cfg.gh['status_field']!r}")
        _STATUS_FIELD = (f["id"], {o["name"]: o["id"] for o in f["options"]})
    return _STATUS_FIELD


def add_to_project(i: Issue) -> str:
    if i.item_id:
        return i.item_id
    q = "mutation($p: ID!, $c: ID!) { addProjectV2ItemById(input: {projectId: $p, contentId: $c}) { item { id } } }"
    if DRY_RUN:
        say(f"gh api graphql addProjectV2ItemById(project {config().gh['project_id']}, content #{i.number})")
        i.item_id = f"<item of #{i.number}>"
        return i.item_id
    try:
        i.item_id = graphql(q, p=config().gh["project_id"], c=i.node_id)["addProjectV2ItemById"]["item"]["id"]
    except Failed as e:  # the board's auto-add workflow (sub-issues) may have been faster
        if "already exists" not in str(e):
            raise
        _, _, i.project_status = live_state(i)
        if not i.item_id:
            raise
    return i.item_id


def set_project_status(i: Issue, name: str) -> None:
    """Put the issue on the project (if missing) and set its Status option."""
    item = add_to_project(i)
    if i.project_status == name:
        return
    if DRY_RUN:
        say(f"gh api graphql updateProjectV2ItemFieldValue(#{i.number}: Status {i.project_status} -> {name})")
        i.project_status = name
        return
    fid, opts = status_field()
    if name not in opts:
        raise Failed(f"project Status has no option {name!r} (has {sorted(opts)})")
    q = """mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) { updateProjectV2ItemFieldValue(input:
      {projectId: $p, itemId: $i, fieldId: $f, value: {singleSelectOptionId: $o}}) { projectV2Item { id } } }"""
    graphql(q, p=config().gh["project_id"], i=item, f=fid, o=opts[name])
    i.project_status = name


def delete_project_item(i: Issue) -> None:
    if not i.item_id:
        return
    q = "mutation($p: ID!, $i: ID!) { deleteProjectV2Item(input: {projectId: $p, itemId: $i}) { deletedItemId } }"
    if DRY_RUN:
        say(f"gh api graphql deleteProjectV2Item(#{i.number})")
        return
    graphql(q, p=config().gh["project_id"], i=i.item_id)
    i.item_id = None


def live_state(i: Issue) -> tuple[str, str, str | None]:
    """(state, state_reason, project Status) re-read from GitHub for one issue."""
    q = """query($n: ID!) { node(id: $n) { ... on Issue { state stateReason
      projectItems(first: 10) { nodes { id project { id }
        fieldValueByName(name: "%s") { ... on ProjectV2ItemFieldSingleSelectValue { name } } } } } } }"""
    cfg = config()
    n = graphql(q % cfg.gh["status_field"], n=i.node_id)["node"]
    item = next((x for x in n["projectItems"]["nodes"] if x["project"]["id"] == cfg.gh["project_id"]), None)
    status = ((item or {}).get("fieldValueByName") or {}).get("name")
    if item:
        i.item_id = item["id"]
    return n["state"], (n["stateReason"] or ""), status


def close_verified(i: Issue, project_status: str, body: str | None = None, attempts: int = 3) -> None:
    """Close as completed + set the project Status, then re-read both; retry what did not stick, else Failed."""
    edit_issue(i, body=body, state="closed", reason="completed")
    set_project_status(i, project_status)
    if DRY_RUN:
        say(f"re-read #{i.number}: expect CLOSED/COMPLETED + project {project_status} (retry up to {attempts}x)")
        return
    for k in range(attempts):
        state, reason, status = live_state(i)
        if state == "CLOSED" and reason == "COMPLETED" and status == project_status:
            return
        time.sleep(1 + k)
        if state != "CLOSED" or reason != "COMPLETED":
            i.state = "OPEN"
            edit_issue(i, state="closed", reason="completed")
        if status != project_status:
            i.project_status = status
            set_project_status(i, project_status)
    state, reason, status = live_state(i)
    if not (state == "CLOSED" and reason == "COMPLETED" and status == project_status):
        raise Failed(
            f"#{i.number} did not stick after {attempts} tries: state {state}/{reason}, project Status {status} "
            f"(wanted CLOSED/COMPLETED + {project_status}): {i.url}"
        )


def mission_log(m: Mission, line: str, *, decision: bool = False) -> None:
    body = m.body
    if decision:
        body = append_line(body, "Key decisions", line)
    body = append_line(body, "Log", ("decision: " if decision else "") + line)
    edit_issue(m.issue, body=body)


def tasks_section(m: Mission) -> str:
    rows = "\n".join(f"- #{t.issue.number}" for t in m.tasks)
    return f"The sub-issues of this issue (`M<N>/T<k> — title`).\n\n{rows}".strip()


# ---------------------------------------------------------------- independence (parallel tasks)

DEPENDS_RE = re.compile(r"^\s*depends on:\s*(.*)$", re.I | re.M)
DEP_REF_RE = re.compile(r"\bM(\d+)/T(\d+)\b|#(\d+)\b")


def plan_files(t: Task) -> set[str] | None:
    """The normalised paths of the Plan's `files:` line; None when missing/empty (then the task runs alone)."""
    m = re.search(r"^files:\s*(.*)$", get_section(t.body, "Plan"), re.M)
    if not m:
        return None
    out = set()
    for raw in re.split(r"[,\s]+", m.group(1)):
        p = raw.strip().strip("`").strip()
        if not p or p.startswith("<") or p in ("—", "-"):
            continue
        p = re.sub(r"^\./", "", p).rstrip("/")
        out.add(re.sub(r"/\*\*?$", "", p))
    return out or None


def shared_paths(a: set[str], b: set[str]) -> list[str]:
    """Paths of a and b that overlap: equal, or one a directory prefix of the other."""
    return sorted(
        {x if len(x) >= len(y) else y for x in a for y in b if x == y or x.startswith(y + "/") or y.startswith(x + "/")}
    )


def depends_on(t: Task) -> list[str]:
    """Refs from the optional `Depends on:` line: `M<N>/T<k>` or `#<issue>`, as written."""
    m = DEPENDS_RE.search(t.body)
    if not m:
        return []
    return [x.group(0) for x in DEP_REF_RE.finditer(m.group(1))]


def _dep_open(ref: str) -> tuple[bool, str]:
    """(still open?, label) for one dependency ref; an unknown ref counts as open."""
    iss = issues()
    mm = DEP_REF_RE.fullmatch(ref)
    if mm and mm.group(3):
        i = iss.get(int(mm.group(3)))
        if i is None:
            return True, f"{ref} (not a mission/task issue — counted as open)"
        st = header(i.body).get("Status", "")
        return (i.open or (st not in ("done", "") and not st.startswith("delivered"))), f"{ref} {i.title}"
    for i in iss.values():
        tm = TASK_TITLE.match(i.title)
        if tm and f"M{tm.group(1)}/T{tm.group(2)}" == ref:
            return (header(i.body).get("Status") != "done" or i.open), f"{ref} (#{i.number})"
    return True, f"{ref} (no such task — counted as open)"


def open_dependencies(t: Task) -> list[str]:
    return [label for ref in depends_on(t) for is_open, label in [_dep_open(ref)] if is_open]


def _is_dep(a: Task, b: Task) -> bool:
    """a lists b in its `Depends on:` line."""
    return any(r in (b.ref, f"#{b.issue.number}") for r in depends_on(a))


def conflict(a: Task, b: Task) -> str:
    """Why a and b may not run in parallel ('' when independent): shared files, a missing files: line, a dependency."""
    if _is_dep(a, b):
        return f"{a.ref} depends on {b.ref}"
    if _is_dep(b, a):
        return f"{b.ref} depends on {a.ref}"
    fa, fb = plan_files(a), plan_files(b)
    if fa is None or fb is None:
        missing = a.ref if fa is None else b.ref
        return f"{missing} has no real `files:` line, so it runs alone"
    shared = shared_paths(fa, fb)
    return f"{a.ref} and {b.ref} share {', '.join(shared)}" if shared else ""


# ---------------------------------------------------------------- the standard / the gate


def check_mission(m: Mission, strict: bool = False) -> list[str]:
    """Findings for one mission against [standard] and the board. strict (approve): no template placeholders."""
    cfg = config()
    ms, ts = cfg.std("mission"), cfg.std("task")
    ml, tl = cfg.label("mission"), cfg.label("task")
    errs: list[str] = []
    where = f"{m.ref} (#{m.issue.number})"
    mk = marker(m.body)
    if mk != ("mission", m.ref):
        errs.append(f"{where}: body marker {mk} != <!-- spectra:mission {m.ref} -->")
    for k in ms["header"]:
        if k not in m.meta:
            errs.append(f"{where}: header has no **{k}:**")
    if ml not in m.issue.labels:
        errs.append(f"{where}: missing label `{ml}`")
    if m.status not in ms["statuses"]:
        errs.append(f"{where}: Status {m.meta.get('Status')!r} not in {ms['statuses']}")
    want_open = m.status != "delivered"
    if m.issue.open != want_open:
        errs.append(f"{where}: body Status {m.status} but the issue is {m.issue.state.lower()}")
    if m.status == "delivered" and m.issue.state_reason != "COMPLETED":
        errs.append(f"{where}: delivered but closed as {m.issue.state_reason or '?'} (want completed)")
    if not m.issue.item_id:
        errs.append(f"{where}: not on project {cfg.gh['project_number']}")
    elif m.status in ms["statuses"] and m.issue.project_status != cfg.project_status("mission", m.status):
        errs.append(
            f"{where}: project Status {m.issue.project_status} != {cfg.project_status('mission', m.status)} for {m.status}"
        )
    if want_open:
        if not m.branch.startswith(cfg.prefix + f"M{m.num}-"):
            errs.append(f"{where}: Branch {m.branch!r} is not {cfg.prefix}M{m.num}-<slug>")
        if m.status == "active" and not m.worktree:
            errs.append(f"{where}: active but no worktree (`mission-tracker start {m.ref}`)")
    heads = [t for t, _ in sections(m.body) if t not in ms["optional_sections"]]
    if heads != ms["sections"]:
        errs.append(f"{where}: sections {heads} != {ms['sections']}")
    if not m.tasks:
        errs.append(f"{where}: no task sub-issues")
    holes = [x for x in ms["placeholder_free"] if is_placeholder(get_section(m.body, x))]
    if (strict or m.status != "proposed") and holes:
        errs.append(f"{where}: {', '.join(holes)} empty or still the template placeholder")
    if strict:
        left = [p for p in template_placeholders("mission.md") if p in strip_comments(m.body)]
        if left:
            errs.append(f"{where}: template placeholders left: {left}")
    seen: set[int] = set()
    for t in m.tasks:
        pre = f"{t.ref} (#{t.issue.number})"
        if t.num in seen:
            errs.append(f"{pre}: number T{t.num} used twice in {m.ref}")
        seen.add(t.num)
        if t.mission != m.num:
            errs.append(f"{pre}: titled for M{t.mission} but a sub-issue of {m.ref}")
        if t.issue.parent != m.issue.number:
            errs.append(f"{pre}: not a sub-issue of #{m.issue.number}")
        if marker(t.body) != ("task", t.ref):
            errs.append(f"{pre}: body marker {marker(t.body)} != <!-- spectra:task {t.ref} -->")
        for k in ts["header"]:
            if k not in t.meta:
                errs.append(f"{pre}: header has no **{k}:**")
        if t.meta.get("Mission", "").lstrip("#") != str(m.issue.number):
            errs.append(f"{pre}: header Mission {t.meta.get('Mission')!r} != #{m.issue.number}")
        if tl not in t.issue.labels:
            errs.append(f"{pre}: missing label `{tl}`")
        for lab in t.labels:
            if lab not in ts["labels"] and lab != cfg.gh.get("test_label", "test"):
                errs.append(f"{pre}: label {lab!r} not in {ts['labels']}")
        if t.status not in ts["statuses"]:
            errs.append(f"{pre}: Status {t.status!r} not in {ts['statuses']}")
        else:
            want = cfg.project_status("task", t.status)
            if t.issue.open != (t.status != "done"):
                errs.append(f"{pre}: body Status {t.status} but the issue is {t.issue.state.lower()}")
            if t.status == "done" and t.issue.state_reason != "COMPLETED":
                errs.append(f"{pre}: done but closed as {t.issue.state_reason or '?'} (want completed)")
            if not t.issue.item_id:
                errs.append(f"{pre}: not on project {cfg.gh['project_number']}")
            elif t.issue.project_status != want:
                errs.append(f"{pre}: project Status {t.issue.project_status} != {want} for {t.status}")
        if t.status == "in-progress":
            if m.status != "active":
                errs.append(f"{pre}: in-progress but {m.ref} is {m.status}")
        theads = [h for h, _ in sections(t.body) if h not in ts["optional_sections"]]
        if theads != ts["sections"]:
            errs.append(f"{pre}: sections {theads} != {ts['sections']} (+ optional {ts['optional_sections']})")
        acc = checklist(get_section(t.body, "Acceptance"))
        if not acc:
            errs.append(f"{pre}: no `- [ ]` items under Acceptance")
        if (strict or m.status != "proposed") and is_placeholder(get_section(t.body, "Goal")):
            errs.append(f"{pre}: Goal is empty or still the template placeholder")
        if not re.search(r"^files:\s*[^<\s]", get_section(t.body, "Plan"), re.M):
            errs.append(f"{pre}: Plan has no real `files:` line")
        if strict:
            pre_outcome = strip_comments(t.body.split("\n## Outcome", 1)[0])
            left = [p for p in template_placeholders("task.md") if p in pre_outcome]
            if left:
                errs.append(f"{pre}: template placeholders left: {left}")
        if t.status == "done" or not t.issue.open:
            if not all(ok for ok, _ in acc):
                errs.append(f"{pre}: closed/done with unticked Acceptance items")
            if is_placeholder(get_section(t.body, "Outcome")):
                errs.append(f"{pre}: closed/done without an Outcome")
            if t.status == "done" and not t.meta.get("Completed"):
                errs.append(f"{pre}: done without a Completed date")
    linked = {t.issue.number for t in m.tasks}
    for i in issues().values():
        tm = TASK_TITLE.match(i.title)
        if tm and int(tm.group(1)) == m.num and i.number not in linked:
            errs.append(
                f"#{i.number} {i.title!r}: titled as a task of {m.ref} but not its sub-issue (or not labelled `{tl}`)"
            )
    running = [t for t in m.tasks if t.status == "in-progress"]
    for x, a in enumerate(running):
        for b in running[x + 1 :]:
            why = conflict(a, b)
            if why:
                errs.append(f"{where}: {a.ref} and {b.ref} are both in progress but not independent: {why}")
        for dep in open_dependencies(a):
            errs.append(f"{a.ref} (#{a.issue.number}): in progress while its dependency {dep} is still open")
    return errs


def require_consistent(m: Mission, ignore: str = "") -> None:
    """The gate of every command that moves work forward: refuse (exit 3) on any check finding."""
    errs = [e for e in check_mission(m) if not (ignore and ignore in e)]
    gate(not errs, f"{m.ref} fails `mission-tracker check {m.ref}`; fix it first:\n- " + "\n- ".join(errs))


def check_store(ref: str | None = None) -> list[str]:
    """Findings for one mission, or for every mission (delivered too) plus orphan tasks and a legacy folder on main."""
    if ref:
        return check_mission(find(ref)[0])
    errs: list[str] = []
    cfg = config()
    if rc(["git", "ls-files", "--error-unmatch", cfg.legacy_rel], cfg.root) == 0:
        errs.append(f"{cfg.main} tracks {cfg.legacy_rel}/: planning lives in GitHub issues, never in the repo")
    ms = missions(include_closed=True)
    seen: dict[int, int] = {}
    claimed = {t.issue.number for m in ms for t in m.tasks}
    for m in ms:
        if m.num in seen:
            errs.append(f"M{m.num}: two mission issues (#{seen[m.num]}, #{m.issue.number})")
        seen[m.num] = m.issue.number
        errs += check_mission(m)
    tl, known = cfg.label("task"), {m.num for m in ms}
    for i in issues().values():
        tm = TASK_TITLE.match(i.title)
        if i.open and tl in i.labels and i.number not in claimed and not (tm and int(tm.group(1)) in known):
            errs.append(f"#{i.number} {i.title!r}: open task issue that is no sub-issue of a mission issue")
    return errs


# ---------------------------------------------------------------- ship state


def verdict_file(num: int) -> Path:
    return config().state_dir / f"review-M{num}.json"


def last_verdict(num: int) -> dict | None:
    f = verdict_file(num)
    if not f.is_file():
        return None
    hist = json.loads(f.read_text(encoding="utf-8"))
    return hist[-1] if hist else None


def record_verdict(num: int, entry: dict) -> None:
    f = verdict_file(num)
    f.parent.mkdir(parents=True, exist_ok=True)
    hist = json.loads(f.read_text(encoding="utf-8")) if f.is_file() else []
    hist.append(entry)
    f.write_text(json.dumps(hist, indent=2), encoding="utf-8")
