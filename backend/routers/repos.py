from typing import Optional
import asyncio
import logging
import re
import httpx

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, AsyncSessionLocal
from models import RepoConfig
from services import github_client as gh
from services import log_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/repos", tags=["repos"])


def _auto_detect_business_unit(owner: str, repo: str) -> Optional[str]:
    """Infer a business unit slug from the repo name using common prefix patterns."""
    repo_lower = repo.lower()
    known = [
        ("isaac_ros_", "isaac_ros"),
        ("isaacros",   "isaac_ros"),
        ("isaaclab",   "isaaclab"),
        ("isaac_lab",  "isaaclab"),
        ("isaac_sim",  "isaac_sim"),
        ("isaacsim",   "isaac_sim"),
        ("orbit_",     "orbit"),
    ]
    for prefix, unit in known:
        if repo_lower.startswith(prefix):
            return unit
    # Generic: first word before _ or - if ≥4 chars
    m = re.match(r'^([a-z][a-z0-9]{3,})[-_]', repo_lower)
    if m:
        return m.group(1)
    return None


class RepoCreate(BaseModel):
    name: str
    owner: str
    repo: str
    gh_pat: Optional[str] = ""


class RepoUpdate(BaseModel):
    name: Optional[str] = None
    gh_pat: Optional[str] = None


def _repo_dict(r: RepoConfig) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "owner": r.owner,
        "repo": r.repo,
        "slug": f"{r.owner}/{r.repo}",
        "has_pat": bool(r.gh_pat),
        "is_active": r.is_active,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "capabilities": r.capabilities or {},
        "business_unit": r.business_unit,
    }


@router.get("")
async def list_repos(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(RepoConfig).order_by(RepoConfig.created_at))).scalars().all()
    return {"repos": [_repo_dict(r) for r in rows]}


@router.post("", status_code=201)
async def add_repo(body: RepoCreate, db: AsyncSession = Depends(get_db)):
    # Check for duplicate
    existing = (await db.execute(
        select(RepoConfig).where(RepoConfig.owner == body.owner, RepoConfig.repo == body.repo)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Repo already added")

    r = RepoConfig(
        name=body.name or f"{body.owner}/{body.repo}",
        owner=body.owner,
        repo=body.repo,
        gh_pat=body.gh_pat or "",
        is_active=False,
        capabilities={},
        business_unit=_auto_detect_business_unit(body.owner, body.repo),
    )
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return _repo_dict(r)


@router.delete("/{repo_id}")
async def delete_repo(repo_id: int, db: AsyncSession = Depends(get_db)):
    r = (await db.execute(select(RepoConfig).where(RepoConfig.id == repo_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Repo not found")
    if r.is_active:
        # Switching away — clear the override so we fall back to env defaults
        gh.clear_active_repo()
    await db.delete(r)
    await db.commit()
    return {"deleted": True, "id": repo_id}


async def _ingest_recent_logs(slug: str) -> None:
    """Background: ingest recent completed GHA runs for the newly active repo."""
    try:
        wf_map = await gh.get_primary_workflows()
        AUTO_WORKFLOWS = [w for w in [wf_map["ci"], wf_map["nightly"]] if w]
        if not AUTO_WORKFLOWS:
            AUTO_WORKFLOWS = wf_map.get("all", [])[:4]
    except Exception:
        AUTO_WORKFLOWS = []
    try:
        for workflow in AUTO_WORKFLOWS:
            try:
                data = await gh.get_workflow_runs(workflow, per_page=10)
            except Exception:
                continue
            for run in data.get("workflow_runs", []):
                if run.get("status") != "completed":
                    continue
                run_id = run["id"]
                async with AsyncSessionLocal() as db:
                    if await log_store.run_has_logs(db, str(run_id), repo_slug=slug):
                        continue
                    try:
                        jobs_data = await gh.get_run_jobs(run_id)
                        entries = []
                        for job in jobs_data.get("jobs", []):
                            raw = await gh.get_job_logs(job["id"])
                            for line in raw.splitlines():
                                line = line.strip()
                                if not line:
                                    continue
                                low = line.lower()
                                level = "ERROR" if "error" in low else "WARNING" if "warn" in low else "INFO"
                                from models import LogEntry
                                entries.append(LogEntry(
                                    source="gha", run_id=str(run_id), level=level,
                                    message=line, meta={"job": job["name"], "repo": slug},
                                ))
                        if entries:
                            db.add_all(entries)
                            await db.commit()
                            logger.info("Auto-ingested %d lines for %s run %s", len(entries), slug, run_id)
                    except Exception as exc:
                        logger.warning("Failed to ingest run %s for %s: %s", run_id, slug, exc)
    except Exception as exc:
        logger.warning("Auto-ingest on repo switch failed for %s: %s", slug, exc)


@router.post("/{repo_id}/activate")
async def activate_repo(repo_id: int, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    r = (await db.execute(select(RepoConfig).where(RepoConfig.id == repo_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Repo not found")

    # Deactivate all
    await db.execute(update(RepoConfig).values(is_active=False))
    # Activate this one
    r.is_active = True
    await db.commit()
    await db.refresh(r)

    # Update in-memory override for github_client
    gh.set_active_repo(r.owner, r.repo, r.gh_pat or None)

    # Kick off background log ingestion for the new repo
    slug = f"{r.owner}/{r.repo}"
    background_tasks.add_task(_ingest_recent_logs, slug)

    return _repo_dict(r)


@router.post("/deactivate")
async def deactivate_all(db: AsyncSession = Depends(get_db)):
    """Revert to env-var defaults."""
    await db.execute(update(RepoConfig).values(is_active=False))
    await db.commit()
    gh.clear_active_repo()
    return {"active": None}


@router.get("/active")
async def get_active(db: AsyncSession = Depends(get_db)):
    r = (await db.execute(
        select(RepoConfig).where(RepoConfig.is_active == True)  # noqa: E712
    )).scalar_one_or_none()
    if r:
        return {"active": _repo_dict(r), "source": "db"}
    from config import settings
    return {
        "active": {
            "id": None,
            "name": f"{settings.GH_OWNER}/{settings.GH_REPO}",
            "owner": settings.GH_OWNER,
            "repo": settings.GH_REPO,
            "slug": f"{settings.GH_OWNER}/{settings.GH_REPO}",
            "has_pat": bool(settings.GH_PAT),
            "is_active": True,
            "created_at": None,
            "capabilities": {},
        },
        "source": "env",
    }


@router.get("/{repo_id}/test")
async def test_repo(repo_id: int, db: AsyncSession = Depends(get_db)):
    r = (await db.execute(select(RepoConfig).where(RepoConfig.id == repo_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Repo not found")
    return await _test_connection(r.owner, r.repo, r.gh_pat or None)


@router.post("/test-connection")
async def test_connection(body: RepoCreate):
    return await _test_connection(body.owner, body.repo, body.gh_pat or None)


async def _test_connection(owner: str, repo: str, pat: Optional[str]) -> dict:
    from config import settings
    token = pat or settings.GH_PAT
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"https://api.github.com/repos/{owner}/{repo}", headers=headers)

    if r.status_code == 404:
        return {"ok": False, "error": "Repository not found or not accessible"}
    if r.status_code == 401:
        return {"ok": False, "error": "Invalid GitHub PAT"}
    if r.status_code == 403:
        return {"ok": False, "error": "GitHub PAT lacks required permissions"}
    if not r.is_success:
        return {"ok": False, "error": f"GitHub API error: {r.status_code}"}

    data = r.json()
    capabilities = await _detect_capabilities(owner, repo, headers)
    return {
        "ok": True,
        "repo": {
            "full_name": data.get("full_name"),
            "description": data.get("description"),
            "default_branch": data.get("default_branch"),
            "stars": data.get("stargazers_count"),
            "language": data.get("language"),
            "private": data.get("private"),
        },
        "capabilities": capabilities,
    }


class BusinessUnitUpdate(BaseModel):
    business_unit: Optional[str] = None


@router.patch("/{repo_id}/business-unit")
async def set_business_unit(repo_id: int, body: BusinessUnitUpdate, db: AsyncSession = Depends(get_db)):
    r = (await db.execute(select(RepoConfig).where(RepoConfig.id == repo_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Repo not found")
    r.business_unit = body.business_unit or None
    await db.commit()
    await db.refresh(r)
    return _repo_dict(r)


async def _detect_capabilities(owner: str, repo: str, headers: dict) -> dict:
    """Probe the repo to detect what dashboard features are available."""
    caps: dict = {}
    async with httpx.AsyncClient(timeout=10) as c:
        # Check for workflows
        r = await c.get(
            f"https://api.github.com/repos/{owner}/{repo}/actions/workflows",
            headers=headers,
            params={"per_page": 30},
        )
        if r.is_success:
            workflows = [w["path"].split("/")[-1] for w in r.json().get("workflows", [])]
            caps["has_actions"] = True
            caps["workflows"] = workflows
            caps["has_nightly"] = any("nightly" in w.lower() for w in workflows)
            caps["has_postmerge"] = any("postmerge" in w.lower() for w in workflows)
        else:
            caps["has_actions"] = False
            caps["workflows"] = []

        # Check language / monorepo
        r2 = await c.get(
            f"https://api.github.com/repos/{owner}/{repo}/languages",
            headers=headers,
        )
        if r2.is_success:
            caps["languages"] = list(r2.json().keys())[:5]

        # Check if there are sub-packages (monorepo hint)
        r3 = await c.get(
            f"https://api.github.com/repos/{owner}/{repo}/contents",
            headers=headers,
        )
        if r3.is_success:
            entries = r3.json()
            dirs = [e["name"] for e in entries if e.get("type") == "dir"]
            caps["is_monorepo"] = any(
                d in dirs for d in ["packages", "apps", "services", "libs", "modules"]
            )

    return caps
