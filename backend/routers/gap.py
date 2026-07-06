"""app/routers/gap.py

FastAPI router: /gap/* — current-vs-target gap analysis for a connected repo.
Reuses git-dboard's existing GitHub client to list repo files + fetch CI-relevant
text; combines with live AWS state. Repo status is treated as INPUT (GitPulse /
GitHub) — we do NOT re-implement repo analytics.

Mount in app/main.py:
    from app.routers import gap
    app.include_router(gap.router)
"""
from __future__ import annotations
import base64, httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.gap_engine import run_gap
from services import github_client as gh

router = APIRouter(prefix="/gap", tags=["gap"])

GITHUB_API = "https://api.github.com"
CI_EXT = (".tf", ".yml", ".yaml", ".py", ".rego", ".hcl", ".sh", ".toml")


class GapRequest(BaseModel):
    repo: str                       # "schundu007/rocm-ci"
    ref: str | None = None
    prefix: str = "myrock"          # AWS resource prefix to detect live state


async def _repo_files_and_text(repo: str, ref: str | None) -> tuple[list[str], str]:
    # Reuse git-dboard's existing GitHub auth (active-repo PAT or GH_PAT) — no separate token.
    async with httpx.AsyncClient(timeout=30) as c:
        meta = (await c.get(f"{GITHUB_API}/repos/{repo}", headers=gh._headers())).json()
        branch = ref or meta.get("default_branch", "main")
        tree = (await c.get(f"{GITHUB_API}/repos/{repo}/git/trees/{branch}?recursive=1",
                            headers=gh._headers())).json()
        files = [n["path"] for n in tree.get("tree", []) if n["type"] == "blob"]
        # fetch text only for CI-relevant files (cap for latency)
        want = [f for f in files if f.endswith(CI_EXT) and
                (".github" in f or f.split("/")[0] in ("infra", "packer", "ai", "buildgraph", "k8s", "scripts"))]
        texts = []
        for f in want[:120]:
            r = await c.get(f"{GITHUB_API}/repos/{repo}/contents/{f}?ref={branch}",
                            headers=gh._headers())
            if r.status_code == 200 and r.json().get("encoding") == "base64":
                try:
                    texts.append(base64.b64decode(r.json()["content"]).decode("utf-8", "ignore"))
                except Exception:
                    pass
        return files, "\n".join(texts)


@router.post("/analyze")
async def analyze(req: GapRequest):
    """Return current-vs-target gap report (single page of scored checks + actions)."""
    try:
        files, text = await _repo_files_and_text(req.repo, req.ref)
    except Exception as e:
        raise HTTPException(502, f"GitHub read failed: {e}")
    return run_gap(files, text, prefix=req.prefix)


@router.get("/target")
def target():
    """The target model itself (for the UI to render the checklist)."""
    from services.target_model import TARGET
    return {"checks": [c.__dict__ for c in TARGET]}


class GuideRequest(BaseModel):
    repo: str
    check_id: str                   # which missing integration to guide
    prefix: str = "myrock"
    in_repo: bool | None = None     # current detection state (from /gap/analyze)
    in_aws: bool | None = None


@router.post("/guide")
async def guide(req: GuideRequest):
    """AI walks the user through configuring ONE missing integration, step by step.
    Turns the gap scorecard into an actionable setup flow (not a passive report)."""
    from services.target_model import TARGET
    from services import llm
    check = next((c for c in TARGET if c.id == req.check_id), None)
    if not check:
        raise HTTPException(404, f"unknown check '{req.check_id}'")
    state = (f"detected in repo files: {req.in_repo}; "
             f"detected live in AWS: {req.in_aws}") if (req.in_repo is not None or req.in_aws is not None) else "not yet detected"
    system = (
        "You are a senior cloud/DevOps architect guiding a user to configure ONE missing "
        "integration for a GitHub Actions + AWS OIDC + Terraform CI/CD platform. "
        "Cover only THIS single item. Be concrete and copy-pasteable: exact CLI commands, "
        "file paths, GitHub Settings navigation (Secrets/Variables/Environments), Terraform "
        "snippets, and end with a one-line VERIFY step the user can run to confirm it's done. "
        "No preamble. Use short numbered steps and fenced code blocks."
    )
    prompt = (
        f"Repo: {req.repo}\n"
        f"Missing capability: {check.title} (category: {check.category}, severity: {check.severity})\n"
        f"Target (what 'good' looks like): {check.target}\n"
        f"Suggested fix: {check.fix}\n"
        f"Current state: {state}\n\n"
        f"Give the numbered steps to configure THIS one item, then a VERIFY step."
    )
    try:
        text = await llm.call(prompt, system)
    except Exception as e:
        raise HTTPException(502, f"AI guidance unavailable: {e}")
    return {"check_id": req.check_id, "title": check.title, "category": check.category,
            "severity": check.severity, "fix": check.fix, "guide": text}
