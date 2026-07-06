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
