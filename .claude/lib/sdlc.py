"""Shared core of the local, file-based SDLC: config, the mission/task store, git and worktrees.

Used by `.claude/skills/mission-tracker/cli.py`, `.claude/skills/ship/cli.py` and the session hook. Values come
from `.claude/sdlc.toml`; the flow is `.claude/sdlc.md`; the conventions `.claude/rules/missions.md`.

**A mission lives only on its branch.** `mission/M<N>-<slug>` holds `.claude/missions/M<N>-<slug>/` (mission.md +
tasks/T<k>-<slug>.md); `main` never does — `ship merge` drops the folder from the merge commit. A mission with a
worktree is read from (and written in) that worktree; without one it is read from the branch with `git show`
(read-only: every change opens the worktree first). A merged mission is gone from the branches; its record is
the merge commit `Merge mission M<N>: …` and its second parent.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import subprocess
import tomllib
from dataclasses import dataclass, field
from pathlib import Path


class Refused(Exception):
    """A gate said no (exit 3): the state is fine, the request is not allowed now."""

    code = 3


class Failed(Exception):
    """Something broke (exit 1): a git error, a conflict, a red check."""

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


def commit_paths(cwd: Path, paths: list[Path], message: str) -> str:
    """Commit exactly these paths (whatever else is staged stays staged). Returns the short sha or ''."""
    rel = [str(p.resolve().relative_to(cwd.resolve())) for p in paths]
    git("add", "-A", "--", *rel, cwd=cwd)
    if not git("diff", "--cached", "--name-only", "--", *rel, cwd=cwd):
        return ""
    git("commit", "-q", "-m", message + TRAILER, "--", *rel, cwd=cwd)
    return git("rev-parse", "--short", "HEAD", cwd=cwd)


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
    def missions_rel(self) -> str:
        return self.raw["store"]["missions_dir"]

    @property
    def templates(self) -> Path:
        return self.root / self.raw["store"]["templates_dir"]

    @property
    def state_dir(self) -> Path:
        return self.root / self.raw["ship"]["state_dir"]

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


# ---------------------------------------------------------------- documents (frontmatter + ## sections)

FM = re.compile(r"\A---\n(.*?)\n---\n", re.S)


def parse_doc(text: str) -> tuple[dict, str]:
    m = FM.match(text)
    if not m:
        return {}, text
    meta: dict = {}
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        k, _, v = line.partition(":")
        v = re.sub(r"\s+#.*$", "", v).strip()
        if v.startswith("[") and v.endswith("]"):
            meta[k.strip()] = [x.strip() for x in v[1:-1].split(",") if x.strip()]
        else:
            meta[k.strip()] = v
    return meta, text[m.end() :]


def dump_doc(meta: dict, body: str) -> str:
    lines = []
    for k, v in meta.items():
        lines.append(f"{k}: [{', '.join(v)}]" if isinstance(v, list) else f"{k}: {v}".rstrip())
    return "---\n" + "\n".join(lines) + "\n---\n" + body


def sections(body: str) -> list[tuple[str, str]]:
    """[(heading, content)] for every `## ` heading, in order (the H1 preamble is dropped)."""
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


def checklist(text: str) -> list[tuple[bool, str]]:
    return [
        (m.group(1).lower() == "x", m.group(2).strip()) for m in re.finditer(r"^\s*- \[( |x|X)\] (.+)$", text, re.M)
    ]


# ---------------------------------------------------------------- the store


@dataclass
class Task:
    num: int
    slug: str
    rel: str  # path relative to the checkout root
    meta: dict
    body: str

    @property
    def ref(self) -> str:
        return self.meta.get("id", "")

    @property
    def status(self) -> str:
        return self.meta.get("status", "")

    @property
    def name(self) -> str:
        return Path(self.rel).name


@dataclass
class Mission:
    num: int
    slug: str
    branch: str
    meta: dict
    body: str
    tasks: list[Task] = field(default_factory=list)
    worktree: Path | None = None
    extra: list[str] = field(default_factory=list)  # other files of the mission folder (rel paths)

    @property
    def ref(self) -> str:
        return f"M{self.num}"

    @property
    def status(self) -> str:
        return self.meta.get("status", "")

    @property
    def rel_dir(self) -> str:
        return f"{config().missions_rel}/M{self.num}-{self.slug}"

    @property
    def wt(self) -> Path:
        """The worktree, for operations that need one (refused when the mission has none open)."""
        if self.worktree is None:
            raise Refused(f"{self.ref} has no worktree open: `mission-tracker open {self.ref}` (or `start`)")
        return self.worktree

    @property
    def dir(self) -> Path:
        if not self.worktree:
            raise Refused(f"{self.ref} has no worktree open: this needs `mission-tracker open {self.ref}`")
        return self.worktree / self.rel_dir

    def task(self, num: int) -> Task:
        for t in self.tasks:
            if t.num == num:
                return t
        raise Refused(f"{self.ref} has no task T{num}")

    # -- writes (worktree only)
    def save(self) -> None:
        self.sync_table()
        (self.dir / "mission.md").write_text(dump_doc(self.meta, self.body), encoding="utf-8")

    def save_task(self, t: Task) -> None:
        (self.wt / t.rel).write_text(dump_doc(t.meta, t.body), encoding="utf-8")

    def commit(self, message: str) -> str:
        return commit_paths(self.wt, [self.dir], message)

    def log(self, line: str) -> None:
        entries = get_section(self.body, "Log")
        self.body = set_section(self.body, "Log", f"{entries}\n- {today()} · {line}".strip())

    def sync_table(self) -> None:
        rows = ["| Task | Status | Labels | Title |", "|---|---|---|---|"]
        for t in self.tasks:
            rows.append(
                f"| [{t.ref}](tasks/{t.name}) | {t.status} | {', '.join(t.meta.get('labels', []))} | {t.meta.get('title', '')} |"
            )
        pat = re.compile(r"(<!-- tasks:begin.*?-->\n).*?(<!-- tasks:end -->)", re.S)
        if pat.search(self.body):
            self.body = pat.sub(lambda m: m.group(1) + "\n".join(rows) + "\n" + m.group(2), self.body)


BRANCH_RE = re.compile(r"^M(\d+)-(.+)$")
TASK_RE = re.compile(r"^T(\d+)-(.+)\.md$")


def _reader(branch: str, wt: Path | None):
    """(list files under a rel dir, read a rel file) for a branch: from its worktree, else from git."""
    if wt is not None:
        root = wt

        def ls(rel: str) -> list[str]:
            base = root / rel
            return sorted(str(p.relative_to(root)) for p in base.rglob("*") if p.is_file()) if base.is_dir() else []

        def read(rel: str) -> str:
            return (root / rel).read_text(encoding="utf-8")
    else:

        def ls(rel: str) -> list[str]:
            return [
                f for f in git("ls-tree", "-r", "--name-only", branch, "--", rel, cwd=main_root()).splitlines() if f
            ]

        def read(rel: str) -> str:
            return git("show", f"{branch}:{rel}", cwd=main_root())

    return ls, read


def load(branch: str, wt: Path | None) -> Mission | None:
    cfg = config()
    m = BRANCH_RE.match(branch[len(cfg.prefix) :])
    if not m:
        return None
    num, slug = int(m.group(1)), m.group(2)
    ls, read = _reader(branch, wt)
    rel_dir = f"{cfg.missions_rel}/M{num}-{slug}"
    files = ls(rel_dir)
    if f"{rel_dir}/mission.md" not in files:
        return None
    meta, body = parse_doc(read(f"{rel_dir}/mission.md") + "\n" if not wt else read(f"{rel_dir}/mission.md"))
    mission = Mission(num, slug, branch, meta, body, worktree=wt)
    tasks = []
    for f in files:
        tm = TASK_RE.match(Path(f).name)
        if f.startswith(f"{rel_dir}/tasks/") and tm:
            tmeta, tbody = parse_doc(read(f) + "\n" if not wt else read(f))
            tasks.append(Task(int(tm.group(1)), tm.group(2), f, tmeta, tbody))
        elif f != f"{rel_dir}/mission.md":
            mission.extra.append(f)
    mission.tasks = sorted(tasks, key=lambda t: t.num)
    return mission


def mission_branches() -> list[str]:
    cfg = config()
    out = git("for-each-ref", "--format=%(refname:short)", f"refs/heads/{cfg.prefix}", cwd=cfg.root).splitlines()
    return [b for b in out if b]


def missions() -> list[Mission]:
    wts = worktrees()
    ms = [m for b in mission_branches() if (m := load(b, wts.get(b)))]
    return sorted(ms, key=lambda m: m.num)


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


def next_number() -> int:
    cfg = config()
    nums = (
        [m.num for m in missions()]
        + [n for n, _, _ in delivered()]
        + [int(x) for x in cfg.raw["store"].get("reserved_numbers", [])]
    )
    for b in mission_branches():
        mm = BRANCH_RE.match(b[len(cfg.prefix) :])
        if mm:
            nums.append(int(mm.group(1)))
    return max(nums, default=-1) + 1


REF_RE = re.compile(r"^\s*M?(\d+)(?:\s*[/.]\s*T?(\d+))?\s*$", re.I)


def parse_ref(ref: str) -> tuple[int, int | None]:
    m = REF_RE.match(ref)
    if not m:
        raise Refused(f"not a mission/task reference: {ref!r} (use M4, M4/T1 or 4.1)")
    return int(m.group(1)), int(m.group(2)) if m.group(2) else None


def find(ref: str) -> tuple[Mission, Task | None]:
    n, t = parse_ref(ref)
    for m in missions():
        if m.num == n:
            return m, (m.task(t) if t is not None else None)
    done = [d for d in delivered() if d[0] == n]
    if done:
        raise Refused(
            f"M{n} was delivered in {done[0][1]} ({done[0][2]}); read it with `git show {done[0][1]}^2:{config().missions_rel}/`"
        )
    raise Refused(f"no mission branch {config().prefix}M{n}-*")


def ensure_worktree(m: Mission) -> Mission:
    """Open (or reuse) the mission's worktree and return the mission re-read from it."""
    if m.worktree:
        return m
    cfg = config()
    wt = cfg.worktree_of(m.branch)
    wt.parent.mkdir(parents=True, exist_ok=True)
    git("worktree", "add", "-q", str(wt), m.branch, cwd=cfg.root)
    return reload(m.branch, wt.resolve())


def reload(branch: str, wt: Path | None) -> Mission:
    """load() for a branch known to hold a mission (Failed when it does not)."""
    m = load(branch, wt)
    if m is None:
        raise Failed(f"{branch} holds no mission folder matching its name")
    return m


def render(template: str, **kw: str) -> str:
    text = (config().templates / template).read_text(encoding="utf-8")
    for k, v in kw.items():
        text = text.replace("{" + k + "}", v)
    return text


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40].strip("-")


# ---------------------------------------------------------------- the standard


def check_mission(m: Mission, strict: bool | None = None) -> list[str]:
    """Findings against [standard]. strict (default: once approved) also refuses template placeholders `<…>`."""
    strict = m.status != "proposed" if strict is None else strict
    cfg = config()
    ms, ts = cfg.std("mission"), cfg.std("task")
    errs: list[str] = []
    where = f"{m.branch}:{m.rel_dir}/mission.md"
    for k in ms["required_meta"]:
        if k not in m.meta:
            errs.append(f"{where}: missing frontmatter `{k}`")
    if m.meta.get("id") != m.ref:
        errs.append(f"{where}: id {m.meta.get('id')!r} != {m.ref}")
    if m.meta.get("branch") != m.branch:
        errs.append(f"{where}: branch {m.meta.get('branch')!r} != {m.branch}")
    if m.status not in ms["statuses"]:
        errs.append(f"{where}: status {m.status!r} not in {ms['statuses']}")
    if m.status == "active" and not m.worktree:
        errs.append(f"{where}: active but no worktree (`mission-tracker start {m.ref}`)")
    heads = [t for t, _ in sections(m.body)]
    if heads != ms["sections"]:
        errs.append(f"{where}: sections {heads} != {ms['sections']}")
    if not m.tasks:
        errs.append(f"{where}: no tasks")
    if strict:
        for s_ in ("Problem", "Scope", "Delivery"):
            c = get_section(m.body, s_)
            if not c or c.startswith("<") or "<what" in c.lower():
                errs.append(f"{where}: {s_} is empty or still the template placeholder")
    for t in m.tasks:
        pre = f"{m.ref}/{t.name}"
        for k in ts["required_meta"]:
            if k not in t.meta:
                errs.append(f"{pre}: missing frontmatter `{k}`")
        if t.ref != f"{m.ref}/T{t.num}":
            errs.append(f"{pre}: id {t.ref!r} != {m.ref}/T{t.num}")
        if t.status not in ts["statuses"]:
            errs.append(f"{pre}: status {t.status!r} not in {ts['statuses']}")
        if t.status == "in-progress" and m.status != "active":
            errs.append(f"{pre}: in-progress but {m.ref} is {m.status}")
        for lab in t.meta.get("labels", []):
            if lab not in ts["labels"]:
                errs.append(f"{pre}: label {lab!r} not in {ts['labels']}")
        theads = [h for h, _ in sections(t.body) if h not in ts["optional_sections"]]
        if theads != ts["sections"]:
            errs.append(f"{pre}: sections {theads} != {ts['sections']} (+ optional {ts['optional_sections']})")
        if strict and get_section(t.body, "Goal").startswith("<"):
            errs.append(f"{pre}: Goal is still the template placeholder")
        acc = checklist(get_section(t.body, "Acceptance"))
        if strict and any(txt.startswith("<") for _, txt in acc):
            errs.append(f"{pre}: Acceptance still has a template placeholder item")
        if not acc:
            errs.append(f"{pre}: no `- [ ]` items under Acceptance")
        if not re.search(r"^files:\s*[^<\s]", get_section(t.body, "Plan"), re.M):
            errs.append(f"{pre}: Plan has no real `files:` line")
        if t.status == "done":
            if not all(ok for ok, _ in acc):
                errs.append(f"{pre}: done with unticked Acceptance items")
            out = get_section(t.body, "Outcome")
            if not out or out.startswith("<"):
                errs.append(f"{pre}: done without an Outcome")
            if not t.meta.get("completed"):
                errs.append(f"{pre}: done without `completed` date")
    return errs


def check_store() -> list[str]:
    errs: list[str] = []
    cfg = config()
    if (cfg.root / cfg.missions_rel).exists() and rc(
        ["git", "ls-files", "--error-unmatch", cfg.missions_rel], cfg.root
    ) == 0:
        errs.append(f"{cfg.main} tracks {cfg.missions_rel}/: missions live only on their branches")
    seen: dict[int, str] = {}
    for b in mission_branches():
        m = load(b, worktrees().get(b))
        if m is None:
            errs.append(f"{b}: no {cfg.missions_rel}/<M-dir>/mission.md matching the branch name")
            continue
        if m.num in seen:
            errs.append(f"{b}: number M{m.num} also used by {seen[m.num]}")
        seen[m.num] = b
        errs += check_mission(m)
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
