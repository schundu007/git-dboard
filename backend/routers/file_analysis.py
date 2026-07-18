"""backend/routers/file_analysis.py

FastAPI router: /analyze/* — real, per-file analysis of CI/infra scripts.

Replaces the frontend's hardcoded, extension-keyed lookup tables. Every field
returned here is derived from the *actual bytes of the file*, not its name or
extension. Results are cached in Postgres keyed by the sha256 of the content, so
each distinct file version is analysed exactly once.

Mount in backend/main.py:
    from routers import file_analysis
    app.include_router(file_analysis.router)
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging

import httpx
from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from database import AsyncSessionLocal
from models import FileAnalysis
from services import github_client as gh
from services import llm

router = APIRouter(prefix="/analyze", tags=["analyze"])
logger = logging.getLogger("file_analysis")

GITHUB_API = "https://api.github.com"

# Files above this size are truncated before analysis — the head of a CI script
# carries the shebang, strict-mode flags, env contract and entrypoint, which is
# where nearly all findings live.
MAX_CHARS = 60_000

SYSTEM = """You are a staff platform/DevOps engineer reviewing a single CI or \
infrastructure file. You will be given the file's exact path and its complete \
contents.

Analyse THIS FILE ONLY. Every statement must be grounded in text that actually \
appears in the provided content. Never describe what a file of this type \
"typically" does. If the file does not submit batch jobs, do not mention batch \
schedulers. If it has no Docker build, do not mention Docker. Generic filler is \
worse than a short answer.

Return ONLY a JSON object (no prose, no markdown fence) with this exact shape:

{
  "summary": "2-4 sentences: what this specific file does, what invokes it, and what it produces. Name the real commands, jobs, env vars and paths from the content.",
  "steps": [
    {"detail": "One concrete step in execution order, citing real identifiers from the file.", "lines": "12-18"}
  ],
  "concepts": ["short tag naming a technique actually used in this file"],
  "issues": [
    {
      "title": "Specific defect in THIS file",
      "severity": "critical|high|medium|low",
      "description": "What is wrong here, quoting the offending construct, and the concrete failure it causes.",
      "fix": "The precise change to make to this file.",
      "lines": "42"
    }
  ],
  "deep_dive": [
    {"q": "A question a reviewer would ask about a decision made in THIS file", "a": "Answer referencing this file's actual content."}
  ]
}

Rules:
- 3-8 steps, in real execution order.
- 3-6 concepts, each a technique visible in the content.
- issues: only real defects you can point at. An empty array is a valid and
  respectable answer for a well-written file. Do NOT invent issues to fill space.
- deep_dive: 3-4 items, each tied to a specific choice made in this file.
- "lines" is a line number or "start-end" range from the provided content; use
  null only when a point genuinely spans the whole file.
"""


def _lang_from_path(path: str) -> str:
    fn = path.rsplit("/", 1)[-1]
    low = fn.lower()
    if low.startswith("dockerfile") or low.endswith(".dockerfile"):
        return "dockerfile"
    if fn in ("Makefile", "Justfile", "Procfile") or low.endswith(".mk"):
        return "makefile"
    ext = fn[fn.rfind("."):].lower() if "." in fn else ""
    return {
        ".sh": "bash", ".bash": "bash", ".zsh": "bash",
        ".py": "python",
        ".yaml": "yaml", ".yml": "yaml",
        ".toml": "toml", ".json": "json",
        ".ps1": "powershell", ".cmake": "cmake",
    }.get(ext, "text")


async def _fetch_content(owner: str, repo: str, path: str) -> str:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}",
            headers=gh._headers(),
        )
    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=f"GitHub API {r.status_code} for {path}")
    data = r.json()
    if data.get("encoding") == "base64":
        return base64.b64decode(data.get("content", "")).decode("utf-8", errors="replace")
    return data.get("content", "")


def _parse_json(raw: str) -> dict:
    """Tolerate a model that wraps its JSON in a markdown fence or adds prose."""
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
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise ValueError("model did not return JSON")
        return json.loads(text[start:end + 1])


def _normalise(obj: dict) -> dict:
    """Coerce the model's output into the exact shape the UI renders.

    Accepts a bare string where an object is expected (models occasionally
    flatten `steps`), so a slightly-off response degrades into a usable one
    rather than an empty pane.
    """
    def as_steps(v):
        out = []
        for s in v or []:
            if isinstance(s, str):
                out.append({"detail": s, "lines": None})
            elif isinstance(s, dict):
                out.append({"detail": s.get("detail") or s.get("step") or "", "lines": s.get("lines")})
        return [s for s in out if s["detail"]]

    def as_issues(v):
        out = []
        for i in v or []:
            if not isinstance(i, dict):
                continue
            sev = str(i.get("severity", "medium")).lower()
            out.append({
                "title": i.get("title", "Untitled finding"),
                "severity": sev if sev in ("critical", "high", "medium", "low") else "medium",
                "description": i.get("description", ""),
                "fix": i.get("fix", ""),
                "lines": i.get("lines"),
            })
        return out

    def as_qa(v):
        return [
            {"q": i.get("q", ""), "a": i.get("a", "")}
            for i in (v or []) if isinstance(i, dict) and i.get("q")
        ]

    return {
        "summary": obj.get("summary", "") or "",
        "steps": as_steps(obj.get("steps")),
        "concepts": [str(c) for c in (obj.get("concepts") or [])][:8],
        "issues": as_issues(obj.get("issues")),
        "deep_dive": as_qa(obj.get("deep_dive")),
    }


@router.get("/file")
async def analyze_file(owner: str, repo: str, path: str, refresh: bool = False):
    """Analyse one CI/infra file. Cached by content hash; `refresh=true` re-runs."""
    slug = f"{owner}/{repo}"
    content = await _fetch_content(owner, repo, path)
    if not content.strip():
        raise HTTPException(status_code=422, detail="File is empty — nothing to analyse")

    sha = hashlib.sha256(content.encode("utf-8")).hexdigest()
    lang = _lang_from_path(path)

    async with AsyncSessionLocal() as db:
        if not refresh:
            cached = await db.scalar(
                select(FileAnalysis).where(
                    FileAnalysis.repo_slug == slug,
                    FileAnalysis.path == path,
                    FileAnalysis.content_sha == sha,
                )
            )
            if cached and cached.result:
                return {"cached": True, "lang": cached.lang, "content_sha": sha, **cached.result}

    truncated = len(content) > MAX_CHARS
    body = content[:MAX_CHARS]
    numbered = "\n".join(f"{i:5d}| {ln}" for i, ln in enumerate(body.splitlines(), 1))

    prompt = (
        f"File path: `{path}`\n"
        f"Repository: {slug}\n"
        f"Detected language: {lang}\n"
        + ("\nNOTE: content truncated to the first "
           f"{MAX_CHARS} characters — do not comment on anything past the cutoff.\n" if truncated else "")
        + "\nContents (line-numbered; the `NNNNN| ` prefix is not part of the file):\n"
        f"```\n{numbered}\n```\n"
    )

    try:
        raw = await llm.call(prompt, SYSTEM)
        result = _normalise(_parse_json(raw))
    except ValueError as exc:
        # No provider key configured, or the model returned unparseable output.
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.exception("file analysis failed for %s", path)
        raise HTTPException(status_code=502, detail=f"Analysis failed: {exc}")

    async with AsyncSessionLocal() as db:
        db.add(FileAnalysis(
            repo_slug=slug, path=path, content_sha=sha, lang=lang, result=result,
        ))
        await db.commit()

    return {"cached": False, "lang": lang, "content_sha": sha, **result}
