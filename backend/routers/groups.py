import asyncio
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models import RepoConfig

router = APIRouter(prefix="/groups", tags=["groups"])

def _display_name(slug: str) -> str:
    """Derive a human-readable group name from a slug (title-cased words)."""
    return " ".join(p.capitalize() for p in slug.replace("-", "_").split("_") if p)


def _repo_brief(r: RepoConfig) -> dict:
    return {
        "id": r.id,
        "slug": f"{r.owner}/{r.repo}",
        "owner": r.owner,
        "repo": r.repo,
        "is_active": r.is_active,
        "business_unit": r.business_unit,
    }


@router.get("")
async def list_groups(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(RepoConfig).order_by(RepoConfig.created_at))).scalars().all()
    groups: dict[str, list] = {}
    ungrouped: list = []
    for r in rows:
        if r.business_unit:
            groups.setdefault(r.business_unit, []).append(r)
        else:
            ungrouped.append(r)

    return {
        "groups": [
            {
                "slug": slug,
                "name": _display_name(slug),
                "repo_count": len(repos),
                "repos": [_repo_brief(r) for r in repos],
            }
            for slug, repos in sorted(groups.items())
        ],
        "ungrouped": [_repo_brief(r) for r in ungrouped],
    }


async def _fetch_repo_metrics(owner: str, repo: str, pat: Optional[str], repo_id: Optional[int] = None) -> dict:
    token = pat or settings.GH_PAT
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }
    base = "https://api.github.com"

    async with httpx.AsyncClient(timeout=12) as c:
        pr_res, runs_res, repo_res = await asyncio.gather(
            c.get(f"{base}/repos/{owner}/{repo}/pulls", headers=headers, params={"state": "open", "per_page": 100}),
            c.get(f"{base}/repos/{owner}/{repo}/actions/runs", headers=headers, params={"per_page": 30}),
            c.get(f"{base}/repos/{owner}/{repo}", headers=headers),
            return_exceptions=True,
        )

    open_prs = 0
    if not isinstance(pr_res, Exception) and pr_res.is_success:
        open_prs = len(pr_res.json())

    ci_rate = None
    last_ci_status = None
    nightly_status = None
    last_nightly_date = None

    if not isinstance(runs_res, Exception) and runs_res.is_success:
        all_runs = runs_res.json().get("workflow_runs", [])
        is_nightly = lambda r: any(kw in (r.get("name") or "").lower() for kw in ("nightly", "daily", "schedule"))  # noqa
        ci_runs = [r for r in all_runs if not is_nightly(r)][:15]
        nightly_runs = [r for r in all_runs if is_nightly(r)]

        if ci_runs:
            completed = [r for r in ci_runs if r.get("conclusion")]
            succeeded = sum(1 for r in completed if r["conclusion"] == "success")
            ci_rate = round(succeeded / len(completed) * 100) if completed else None
            last_ci_status = ci_runs[0].get("conclusion") or ci_runs[0].get("status")

        if nightly_runs:
            nightly_status = nightly_runs[0].get("conclusion") or nightly_runs[0].get("status")
            last_nightly_date = (nightly_runs[0].get("created_at") or "")[:10]

    stars = None
    language = None
    if not isinstance(repo_res, Exception) and repo_res.is_success:
        rd = repo_res.json()
        stars = rd.get("stargazers_count")
        language = rd.get("language")

    return {
        "id": repo_id,
        "slug": f"{owner}/{repo}",
        "owner": owner,
        "repo": repo,
        "open_prs": open_prs,
        "ci_rate": ci_rate,
        "last_ci_status": last_ci_status,
        "nightly_status": nightly_status,
        "last_nightly_date": last_nightly_date,
        "stars": stars,
        "language": language,
    }


@router.get("/{slug}/summary")
async def get_group_summary(slug: str, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(RepoConfig).where(RepoConfig.business_unit == slug)
    )).scalars().all()

    if not rows:
        raise HTTPException(status_code=404, detail=f"Group '{slug}' not found")

    metrics = await asyncio.gather(
        *[_fetch_repo_metrics(r.owner, r.repo, r.gh_pat or None, r.id) for r in rows],
        return_exceptions=True,
    )
    repo_metrics = [m for m in metrics if isinstance(m, dict)]

    total_open_prs = sum(m["open_prs"] for m in repo_metrics)

    rates = [m["ci_rate"] for m in repo_metrics if m["ci_rate"] is not None]
    avg_ci_rate = round(sum(rates) / len(rates)) if rates else None

    nightly_with_data = [m for m in repo_metrics if m["nightly_status"]]
    nightly_pass = sum(1 for m in nightly_with_data if m["nightly_status"] == "success")
    nightly_pass_rate = round(nightly_pass / len(nightly_with_data) * 100) if nightly_with_data else None

    return {
        "group": {
            "slug": slug,
            "name": _display_name(slug),
            "repo_count": len(rows),
        },
        "repos": repo_metrics,
        "aggregate": {
            "total_open_prs": total_open_prs,
            "ci_pass_rate": avg_ci_rate,
            "nightly_pass_rate": nightly_pass_rate,
            "repos_with_nightly": len(nightly_with_data),
        },
    }
