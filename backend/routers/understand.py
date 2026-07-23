"""backend/routers/understand.py

FastAPI router: /understand/* — reproduces the "Understand Anything" experience on
GitPulser infrastructure so git-graph's web UI can add a repo, generate its
knowledge graph, and run understand-* commands without Claude Code.

Stage 2a (this file):
  - POST /understand/generate            build a file-level knowledge graph
  - GET  /understand/generate/status     progress of an in-flight generation
  - GET  /understand/data/{o}/{r}/knowledge-graph.json | meta.json | config.json
  - GET  /understand/data/{o}/{r}/file-content/{path}   on-demand source, viewer shape
  - POST /understand/chat                Q&A over the graph (LLM)
  - POST /understand/onboard             onboarding guide (deterministic, no LLM)
  - POST /understand/{diff,domain,knowledge}   honest 501 until Stage 2b

The graph is file-level: nodes = files + directory modules, edges = containment,
layers = top-level directories. Shape matches core/src/types.ts KnowledgeGraph so
the dashboard renders it directly. Per-file summaries are content-hash cached
(GraphFileSummary), so re-generation only re-summarises changed files.

Mount in backend/main.py:
    from routers import understand
    app.include_router(understand.router)
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from database import AsyncSessionLocal
from models import GraphAnalysis, GraphFileSummary, GraphOverlay
from services import github_client as gh
from services import llm

router = APIRouter(prefix="/understand", tags=["understand"])
logger = logging.getLogger("understand")

GITHUB_API = "https://api.github.com"
MAX_CHARS = 40_000            # per-file content cap before summarising
MAX_FILES = 200               # hard cap on files summarised per run (billed calls)
GEN_CONCURRENCY = 5

# Directories/files that add noise, not understanding.
_IGNORE_DIRS = {
    "node_modules", ".git", "dist", "build", "out", ".next", "vendor",
    "__pycache__", ".venv", "venv", "target", "assets", "public",
    ".github/workflows/cache", "coverage", ".idea", ".vscode",
}
_CODE_EXT = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java", ".rb", ".php",
    ".c", ".h", ".cpp", ".hpp", ".cs", ".kt", ".swift", ".scala", ".dart",
    ".sh", ".bash", ".yml", ".yaml", ".toml", ".tf", ".cmake", ".mjs",
    ".md", ".sql", ".proto", ".graphql",
}
_EXT_LANG = {
    ".py": "python", ".ts": "typescript", ".tsx": "typescript", ".js": "javascript",
    ".jsx": "javascript", ".go": "go", ".rs": "rust", ".java": "java", ".rb": "ruby",
    ".php": "php", ".c": "c", ".h": "c", ".cpp": "cpp", ".hpp": "cpp", ".cs": "csharp",
    ".kt": "kotlin", ".swift": "swift", ".scala": "scala", ".dart": "dart",
    ".sh": "bash", ".bash": "bash", ".yml": "yaml", ".yaml": "yaml", ".toml": "toml",
    ".tf": "terraform", ".cmake": "cmake", ".mjs": "javascript", ".md": "markdown",
    ".sql": "sql", ".proto": "protobuf", ".graphql": "graphql",
}

SUMMARY_SYSTEM = """You summarise ONE source file for a codebase knowledge graph. \
You are given the file's path and exact contents. Describe only what this file \
actually contains — never what a file of its type "typically" does.

Return ONLY a JSON object (no prose, no fence):
{
  "summary": "1-2 sentences: what this file is responsible for, grounded in its real contents.",
  "tags": ["3-6 short tags naming the concerns actually present"],
  "complexity": "simple|moderate|complex",
  "role": "one of: entrypoint|core|config|test|docs|utility|interface|data"
}"""


# ─── shared helpers ──────────────────────────────────────────────────────────

def _ext(path: str) -> str:
    fn = path.rsplit("/", 1)[-1]
    return fn[fn.rfind("."):].lower() if "." in fn else ""


def _lang(path: str) -> str:
    return _EXT_LANG.get(_ext(path), "text")


def _keep(path: str, mode: str) -> bool:
    parts = path.split("/")
    if any(p in _IGNORE_DIRS for p in parts):
        return False
    return _ext(path) in _CODE_EXT


def _parse_json(raw: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.lstrip().startswith("json"):
            text = text.lstrip()[4:]
        text = text.rsplit("```", 1)[0]
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        s, e = text.find("{"), text.rfind("}")
        if s == -1 or e <= s:
            raise ValueError("model did not return JSON")
        return json.loads(text[s:e + 1])


async def _fetch_content(owner: str, repo: str, path: str) -> str:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}", headers=gh._headers())
    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=f"GitHub API {r.status_code} for {path}")
    data = r.json()
    if data.get("encoding") == "base64":
        return base64.b64decode(data.get("content", "")).decode("utf-8", errors="replace")
    return data.get("content", "")


async def _fetch_tree(owner: str, repo: str) -> tuple[list[str], str]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/HEAD?recursive=1", headers=gh._headers())
    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=f"GitHub API {r.status_code} listing tree")
    data = r.json()
    files = [t["path"] for t in data.get("tree", []) if t.get("type") == "blob"]
    return files, data.get("sha", "")


# ─── per-file summarise (cached) ─────────────────────────────────────────────

async def _summarise_file(owner: str, repo: str, path: str) -> dict:
    slug = f"{owner}/{repo}"
    content = await _fetch_content(owner, repo, path)
    sha = hashlib.sha256(content.encode("utf-8")).hexdigest()

    async with AsyncSessionLocal() as db:
        cached = await db.scalar(select(GraphFileSummary).where(
            GraphFileSummary.repo_slug == slug,
            GraphFileSummary.path == path,
            GraphFileSummary.content_sha == sha,
        ))
        if cached and cached.result:
            return cached.result

    body = content[:MAX_CHARS]
    prompt = f"File path: `{path}`\nLanguage: {_lang(path)}\n\nContents:\n```\n{body}\n```\n"
    raw = await llm.call(prompt, SUMMARY_SYSTEM, max_tokens=1024, thinking=False)
    obj = _parse_json(raw)
    result = {
        "summary": str(obj.get("summary", ""))[:600],
        "tags": [str(t) for t in (obj.get("tags") or [])][:6],
        "complexity": obj.get("complexity") if obj.get("complexity") in ("simple", "moderate", "complex") else "moderate",
        "role": str(obj.get("role", "core")),
    }
    async with AsyncSessionLocal() as db:
        db.add(GraphFileSummary(repo_slug=slug, path=path, content_sha=sha, result=result))
        await db.commit()
    return result


# ─── graph assembly (file-level; pluggable for function-level later) ─────────

def _build_graph(owner: str, repo: str, summaries: dict[str, dict], commit_sha: str) -> dict:
    nodes, edges, dirs = [], [], set()

    def dir_of(p: str) -> str:
        return p.rsplit("/", 1)[0] if "/" in p else ""

    # file nodes
    for path, s in summaries.items():
        nodes.append({
            "id": f"file:{path}", "type": "file", "name": path.rsplit("/", 1)[-1],
            "filePath": path, "summary": s.get("summary", ""),
            "tags": s.get("tags", []), "complexity": s.get("complexity", "moderate"),
        })
        d = dir_of(path)
        while d:
            dirs.add(d)
            d = dir_of(d)

    # directory module nodes + containment edges (module->child)
    for d in sorted(dirs):
        nodes.append({
            "id": f"module:{d}", "type": "module", "name": d.rsplit("/", 1)[-1],
            "filePath": d, "summary": f"Directory `{d}`.", "tags": ["directory"], "complexity": "moderate",
        })
    def parent_id(p: str, is_file: bool) -> str | None:
        d = dir_of(p)
        if not d:
            return None
        return f"module:{d}"
    for path in summaries:
        pid = parent_id(path, True)
        if pid:
            edges.append({"source": pid, "target": f"file:{path}", "type": "contains",
                          "direction": "forward", "weight": 1})
    for d in dirs:
        pid = parent_id(d, False)
        if pid:
            edges.append({"source": pid, "target": f"module:{d}", "type": "contains",
                          "direction": "forward", "weight": 1})

    # layers = top-level directories
    tops: dict[str, list[str]] = {}
    for path in summaries:
        top = path.split("/", 1)[0] if "/" in path else "(root)"
        tops.setdefault(top, []).append(f"file:{path}")
    layers = [{"id": f"layer:{t}", "name": t, "description": f"Top-level `{t}`.",
               "nodeIds": ids} for t, ids in sorted(tops.items())]

    # a short heuristic tour: README + entrypoints + biggest dirs
    tour, order = [], 1
    entry = [p for p in summaries if summaries[p].get("role") == "entrypoint"][:3]
    readme = [p for p in summaries if p.lower().endswith("readme.md")][:1]
    for p in (readme + entry):
        tour.append({"order": order, "title": f"Start: {p.rsplit('/',1)[-1]}",
                     "description": summaries[p].get("summary", ""), "nodeIds": [f"file:{p}"]})
        order += 1
    for t, ids in sorted(tops.items(), key=lambda kv: -len(kv[1]))[:3]:
        tour.append({"order": order, "title": f"Explore {t}/",
                     "description": f"{len(ids)} files under {t}/.", "nodeIds": ids[:8]})
        order += 1

    langs = sorted({_lang(p) for p in summaries if _lang(p) != "text"})
    return {
        "version": "1.0.0", "kind": "codebase",
        "project": {
            "name": repo, "languages": langs, "frameworks": [],
            "description": f"{owner}/{repo} — file-level knowledge graph ({len(summaries)} files).",
            "analyzedAt": datetime.now(timezone.utc).isoformat(), "gitCommitHash": commit_sha,
        },
        "nodes": nodes, "edges": edges, "layers": layers, "tour": tour,
    }


# ─── generation job (async, prewarm-style state) ────────────────────────────

_gen_state: dict[str, dict] = {}


async def _generate_worker(owner: str, repo: str, files: list[str], commit_sha: str) -> None:
    slug = f"{owner}/{repo}"
    state = _gen_state[slug]
    sem = asyncio.Semaphore(GEN_CONCURRENCY)
    summaries: dict[str, dict] = {}

    async def one(path: str):
        async with sem:
            try:
                summaries[path] = await _summarise_file(owner, repo, path)
                state["done"] += 1
            except Exception as exc:
                state["failed"] += 1
                logger.warning("summarise failed %s: %s", path, exc)

    try:
        await asyncio.gather(*(one(p) for p in files))
        if not summaries:
            state["error"] = "No files could be summarised (check provider key / token)."
            return
        graph = _build_graph(owner, repo, summaries, commit_sha)
        meta = {
            "lastAnalyzedAt": datetime.now(timezone.utc).isoformat(),
            "gitCommitHash": commit_sha, "version": "1.0.0", "analyzedFiles": len(summaries),
        }
        async with AsyncSessionLocal() as db:
            row = await db.scalar(select(GraphAnalysis).where(GraphAnalysis.repo_slug == slug))
            if row:
                row.graph, row.meta, row.commit_sha, row.analyzed_files = graph, meta, commit_sha, len(summaries)
            else:
                db.add(GraphAnalysis(repo_slug=slug, graph=graph, meta=meta,
                                     commit_sha=commit_sha, analyzed_files=len(summaries)))
            await db.commit()
        state["nodes"] = len(graph["nodes"])
        state["edges"] = len(graph["edges"])
    except Exception as exc:
        state["error"] = str(exc)[:300]
        logger.exception("graph generation failed for %s", slug)
    finally:
        state["running"] = False


@router.post("/generate")
async def generate(body: dict):
    """Build a file-level knowledge graph for a repo.

    Body: {owner, repo, scope?}. `scope` limits analysis to a subdirectory
    (the /understand <subdir> behaviour). Async — poll /generate/status.
    """
    owner = (body.get("owner") or "").strip()
    repo = (body.get("repo") or "").strip()
    scope = (body.get("scope") or "").strip().strip("/")
    if not owner or not repo:
        raise HTTPException(status_code=422, detail="owner and repo are required")
    slug = f"{owner}/{repo}"

    st = _gen_state.get(slug)
    if st and st.get("running"):
        return {"started": False, "reason": "already running", **st}

    files, commit_sha = await _fetch_tree(owner, repo)
    files = [f for f in files if _keep(f, "code")]
    if scope:
        files = [f for f in files if f.startswith(scope + "/") or f == scope]
    truncated = len(files) > MAX_FILES
    files = files[:MAX_FILES]

    _gen_state[slug] = {
        "running": True, "total": len(files), "done": 0, "failed": 0,
        "truncated": truncated, "scope": scope or None, "error": None,
    }
    asyncio.create_task(_generate_worker(owner, repo, files, commit_sha))
    return {"started": True, **_gen_state[slug]}


@router.get("/generate/status")
async def generate_status(owner: str, repo: str):
    slug = f"{owner}/{repo}"
    st = _gen_state.get(slug)
    if st:
        return st
    async with AsyncSessionLocal() as db:
        row = await db.scalar(select(GraphAnalysis).where(GraphAnalysis.repo_slug == slug))
    if row:
        return {"running": False, "done": row.analyzed_files, "total": row.analyzed_files,
                "nodes": len(row.graph.get("nodes", [])), "edges": len(row.graph.get("edges", [])),
                "existing": True}
    return {"running": False, "total": 0, "done": 0, "existing": False}


# ─── data serving (matches the dashboard's fetch contract) ──────────────────

async def _load_graph(owner: str, repo: str) -> GraphAnalysis:
    slug = f"{owner}/{repo}"
    async with AsyncSessionLocal() as db:
        row = await db.scalar(select(GraphAnalysis).where(GraphAnalysis.repo_slug == slug))
    if not row:
        raise HTTPException(status_code=404, detail=f"No graph generated for {slug}. Run /understand/generate.")
    return row


@router.get("/data/{owner}/{repo}/knowledge-graph.json")
async def data_graph(owner: str, repo: str):
    return (await _load_graph(owner, repo)).graph


@router.get("/data/{owner}/{repo}/meta.json")
async def data_meta(owner: str, repo: str):
    return (await _load_graph(owner, repo)).meta


@router.get("/data/{owner}/{repo}/config.json")
async def data_config(owner: str, repo: str):
    return {"autoUpdate": False, "outputLanguage": "en"}


@router.get("/data/{owner}/{repo}/file-content/{filepath:path}")
async def data_file_content(owner: str, repo: str, filepath: str):
    """Serve source content in the viewer's shape. The viewer requests
    `<base>file-content/<path>.json`, so strip the trailing .json and fetch."""
    path = filepath[:-5] if filepath.endswith(".json") else filepath
    content = await _fetch_content(owner, repo, path)
    return {"path": path, "language": _lang(path), "content": content}


# ─── overlays (diff + domain): stored + served to the viewer ────────────────

async def _save_overlay(slug: str, kind: str, data: dict) -> None:
    async with AsyncSessionLocal() as db:
        row = await db.scalar(select(GraphOverlay).where(
            GraphOverlay.repo_slug == slug, GraphOverlay.kind == kind))
        if row:
            row.data = data
        else:
            db.add(GraphOverlay(repo_slug=slug, kind=kind, data=data))
        await db.commit()


async def _load_overlay(slug: str, kind: str):
    async with AsyncSessionLocal() as db:
        row = await db.scalar(select(GraphOverlay).where(
            GraphOverlay.repo_slug == slug, GraphOverlay.kind == kind))
    return row.data if row else None


@router.get("/data/{owner}/{repo}/diff-overlay.json")
async def data_diff_overlay(owner: str, repo: str):
    d = await _load_overlay(f"{owner}/{repo}", "diff")
    if not d:
        raise HTTPException(status_code=404, detail="No diff overlay. Run /understand/diff.")
    return d


@router.get("/data/{owner}/{repo}/domain-graph.json")
async def data_domain_graph(owner: str, repo: str):
    d = await _load_overlay(f"{owner}/{repo}", "domain")
    if not d:
        raise HTTPException(status_code=404, detail="No domain graph. Run /understand/domain.")
    return d


# ─── commands ────────────────────────────────────────────────────────────────

CHAT_SYSTEM = """You answer questions about a codebase using ONLY the provided \
knowledge-graph context (file summaries and their relationships). Be concrete and \
cite file paths. If the context does not contain the answer, say so plainly."""


def _search_nodes(graph: dict, query: str, limit: int = 25) -> list[dict]:
    q = query.lower()
    terms = [t for t in q.replace("/", " ").replace(".", " ").split() if len(t) > 2]
    scored = []
    for n in graph.get("nodes", []):
        hay = (n.get("name", "") + " " + n.get("filePath", "") + " " + n.get("summary", "") + " " + " ".join(n.get("tags", []))).lower()
        score = sum(hay.count(t) for t in terms)
        if score:
            scored.append((score, n))
    scored.sort(key=lambda x: -x[0])
    return [n for _, n in scored[:limit]]


@router.post("/chat")
async def chat(body: dict):
    """Q&A over the generated graph (understand-chat)."""
    owner, repo = (body.get("owner") or "").strip(), (body.get("repo") or "").strip()
    query = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=422, detail="query is required")
    graph = (await _load_graph(owner, repo)).graph
    hits = _search_nodes(graph, query)
    if not hits:
        return {"answer": "No files in the graph match that question. Try different terms, or (re)generate the graph."}
    ctx = "\n".join(f"- {n['filePath']}: {n.get('summary','')} [tags: {', '.join(n.get('tags',[]))}]" for n in hits)
    prompt = f"Question: {query}\n\nRelevant files:\n{ctx}\n\nAnswer using only these files."
    answer = await llm.call(prompt, CHAT_SYSTEM, max_tokens=1500, thinking=False)
    return {"answer": answer, "citedFiles": [n["filePath"] for n in hits[:8]]}


@router.post("/onboard")
async def onboard(body: dict):
    """Deterministic onboarding guide from the graph (understand-onboard, no LLM)."""
    owner, repo = (body.get("owner") or "").strip(), (body.get("repo") or "").strip()
    g = (await _load_graph(owner, repo)).graph
    p = g.get("project", {})
    lines = [f"# Onboarding — {p.get('name', repo)}", "", p.get("description", ""), ""]
    if p.get("languages"):
        lines += [f"**Languages:** {', '.join(p['languages'])}", ""]
    lines += ["## Architecture (top-level layers)", ""]
    for lyr in g.get("layers", []):
        lines.append(f"- **{lyr['name']}** — {len(lyr.get('nodeIds', []))} files")
    tour = g.get("tour", [])
    if tour:
        lines += ["", "## Suggested reading order", ""]
        for s in tour:
            lines.append(f"{s['order']}. **{s['title']}** — {s.get('description', '')}")
    return {"markdown": "\n".join(lines)}


AUDIT_SYSTEM = """You are a principal engineer auditing a software system against \
modern best practices, using its knowledge graph (per-file summaries, tags, roles, \
and the directory/layer structure). Judge ONLY what the graph evidences — cite real \
file paths. Absence is evidence too: if there are no test files, no CI config, no \
security scanning, no observability, say so.

Assess these areas: architecture & modularity, testing, CI/CD, security, \
documentation, observability/logging, dependency & config management, error handling.

Return ONLY a JSON object (no prose, no fence):
{
  "score": 0-100,
  "summary": "2-3 sentences on the system's overall health vs best practice.",
  "strengths": ["specific good practice actually present, citing files"],
  "gaps": [
    {
      "area": "one of the areas above",
      "severity": "critical|high|medium|low",
      "finding": "what is missing or wrong, grounded in the graph.",
      "recommendation": "the concrete best-practice change to make.",
      "evidence": ["file or directory paths that show this"]
    }
  ],
  "quick_wins": ["small high-leverage change that could be done now"]
}
Rules: 4-8 gaps, prioritised most-severe first. Every gap must name a real area and
cite evidence paths from the graph. Do not invent files."""


def _graph_context(g: dict, cap: int = 140) -> str:
    p = g.get("project", {})
    lines = [
        f"Project: {p.get('name','?')}",
        f"Languages: {', '.join(p.get('languages') or []) or 'unknown'}",
        f"Description: {p.get('description','')}",
        "",
        "Layers (top-level directories):",
    ]
    for lyr in g.get("layers", []):
        lines.append(f"  - {lyr['name']}: {len(lyr.get('nodeIds', []))} files")
    lines.append("")
    lines.append("Files (path — role — tags — summary):")
    files = [n for n in g.get("nodes", []) if n.get("type") == "file"]
    for n in files[:cap]:
        tags = ", ".join(n.get("tags", []))
        lines.append(f"  - {n.get('filePath')} — {n.get('complexity','')} — [{tags}] — {n.get('summary','')}")
    if len(files) > cap:
        lines.append(f"  … and {len(files) - cap} more files (truncated).")
    return "\n".join(lines)


@router.post("/audit")
async def audit(body: dict):
    """Evaluate a repo's EXISTING system against best practices, from its graph.

    This is the capability that lets GitPulser turn a knowledge graph into
    prioritised, evidence-linked improvement recommendations (feeds Action Plan).
    Body: {owner, repo}. Requires a generated graph (run /understand/generate).
    """
    owner, repo = (body.get("owner") or "").strip(), (body.get("repo") or "").strip()
    g = (await _load_graph(owner, repo)).graph
    prompt = (
        f"Knowledge graph for {owner}/{repo}:\n\n{_graph_context(g)}\n\n"
        "Audit this existing system against best practices and return the JSON."
    )
    raw = await llm.call(prompt, AUDIT_SYSTEM, max_tokens=4096, thinking=False)
    try:
        result = _parse_json(raw)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Audit parse failed: {exc}")
    result.setdefault("gaps", [])
    result.setdefault("strengths", [])
    result.setdefault("quick_wins", [])
    return result


@router.post("/diff")
async def diff(body: dict):
    """understand-diff: changed files since the graph's commit (or a given base)
    → changed/affected nodes → diff-overlay.json (lights up the Diff toggle)."""
    owner, repo = (body.get("owner") or "").strip(), (body.get("repo") or "").strip()
    row = await _load_graph(owner, repo)
    g = row.graph
    base = (body.get("base") or row.commit_sha or "").strip()
    if not base:
        raise HTTPException(status_code=422, detail="No base commit to diff against; provide {base}.")
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{GITHUB_API}/repos/{owner}/{repo}/compare/{base}...HEAD", headers=gh._headers())
    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=f"GitHub compare {r.status_code} (base {base[:12]})")
    changed_files = [f["filename"] for f in r.json().get("files", [])]
    node_ids = {n["id"] for n in g.get("nodes", [])}
    changed_nodes = [f"file:{p}" for p in changed_files if f"file:{p}" in node_ids]
    cset = set(changed_nodes)
    affected = set()
    for e in g.get("edges", []):
        if e["source"] in cset:
            affected.add(e["target"])
        if e["target"] in cset:
            affected.add(e["source"])
    affected -= cset
    overlay = {
        "version": "1.0.0", "baseBranch": base[:12], "generatedAt": datetime.now(timezone.utc).isoformat(),
        "changedFiles": changed_files, "changedNodeIds": changed_nodes, "affectedNodeIds": sorted(affected),
    }
    await _save_overlay(f"{owner}/{repo}", "diff", overlay)
    return {"changedFiles": len(changed_files), "changedNodes": len(changed_nodes),
            "affectedNodes": len(affected), "base": base[:12],
            "hint": "Open the graph and toggle Diff to highlight the blast radius."}


DOMAIN_SYSTEM = """You extract the DOMAIN model of a system from its knowledge \
graph (file summaries + structure). Identify the business/functional domains, the \
key flows within each, and the steps of each flow — grounded in the real files.

Return ONLY a JSON object (no prose, no fence):
{
  "nodes": [
    {"id":"domain:<slug>","type":"domain","name":"...","summary":"...","tags":["..."],"complexity":"moderate"},
    {"id":"flow:<slug>","type":"flow","name":"...","summary":"...","tags":[],"complexity":"moderate"},
    {"id":"step:<slug>","type":"step","name":"...","summary":"...","tags":[],"complexity":"simple"}
  ],
  "edges": [
    {"source":"domain:x","target":"flow:y","type":"contains_flow","direction":"forward","weight":1},
    {"source":"flow:y","target":"step:z","type":"flow_step","direction":"forward","weight":1}
  ]
}
3-7 domains. Ids must be unique and referenced consistently in edges."""


def _normalise_domain_graph(obj: dict, base_graph: dict) -> dict:
    nodes = []
    for n in obj.get("nodes", []):
        nid, name = n.get("id"), n.get("name")
        if not nid or not name:
            continue
        t = n.get("type")
        nodes.append({
            "id": str(nid), "type": t if t in ("domain", "flow", "step") else "domain",
            "name": str(name), "summary": str(n.get("summary", "")),
            "tags": [str(x) for x in (n.get("tags") or [])][:6],
            "complexity": n.get("complexity") if n.get("complexity") in ("simple", "moderate", "complex") else "moderate",
        })
    ids = {n["id"] for n in nodes}
    edges = []
    for e in obj.get("edges", []):
        if e.get("source") in ids and e.get("target") in ids:
            edges.append({"source": e["source"], "target": e["target"],
                          "type": e.get("type", "contains_flow"),
                          "direction": e.get("direction", "forward"), "weight": e.get("weight", 1)})
    p = base_graph.get("project", {})
    layers = [{"id": f"layer:{n['id']}", "name": n["name"], "description": n.get("summary", ""), "nodeIds": [n["id"]]}
              for n in nodes if n["type"] == "domain"]
    return {
        "version": "1.0.0",
        "project": {"name": f"{p.get('name','')} — domains", "languages": p.get("languages", []),
                    "frameworks": [], "description": "Domain model derived from the knowledge graph.",
                    "analyzedAt": datetime.now(timezone.utc).isoformat(), "gitCommitHash": p.get("gitCommitHash", "")},
        "nodes": nodes, "edges": edges, "layers": layers, "tour": [],
    }


@router.post("/domain")
async def domain(body: dict):
    """understand-domain: derive a domain graph from the knowledge graph → domain-graph.json
    (lights up the dashboard's Domain view)."""
    owner, repo = (body.get("owner") or "").strip(), (body.get("repo") or "").strip()
    g = (await _load_graph(owner, repo)).graph
    prompt = f"Knowledge graph for {owner}/{repo}:\n\n{_graph_context(g)}\n\nExtract the domain model as JSON."
    raw = await llm.call(prompt, DOMAIN_SYSTEM, max_tokens=4096, thinking=False)
    try:
        dg = _normalise_domain_graph(_parse_json(raw), g)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Domain parse failed: {exc}")
    if not dg["nodes"]:
        raise HTTPException(status_code=502, detail="Model returned no domain nodes.")
    await _save_overlay(f"{owner}/{repo}", "domain", dg)
    domains = sum(1 for n in dg["nodes"] if n["type"] == "domain")
    return {"domains": domains, "nodes": len(dg["nodes"]), "edges": len(dg["edges"]),
            "hint": "Open the graph and switch to the Domain view."}


@router.post("/knowledge")
async def knowledge(body: dict):
    raise HTTPException(status_code=501, detail="understand-knowledge (wiki ingestion) is not enabled on this backend yet.")
