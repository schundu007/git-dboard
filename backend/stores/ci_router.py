"""
Failure Intelligence read endpoints, served from the ClickHouse warehouse.

These are the Phase-1 primitives (flakes / chronic / slowest / clusters) that
the live GitHub API could not compute cheaply. All read from ci_jobs FINAL.
"""

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

from . import get_store

router = APIRouter(prefix="/ci", tags=["ci-intelligence"])


@router.get("/health")
async def ci_health() -> dict[str, Any]:
    """Report ClickHouse connectivity + row counts (fast smoke test for deploy)."""
    try:
        store = await get_store()
        runs = await store.client.query("SELECT count() FROM ci_workflow_runs")
        jobs = await store.client.query("SELECT count() FROM ci_jobs")
        return {
            "clickhouse": "connected",
            "workflow_runs": int(runs.result_rows[0][0]),
            "jobs": int(jobs.result_rows[0][0]),
        }
    except Exception as exc:  # surface the real error instead of a silent 500
        raise HTTPException(status_code=503, detail=f"clickhouse unavailable: {exc}")


@router.get("/flakes")
async def ci_flakes(
    repo: str,
    job_name: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
) -> list[dict[str, Any]]:
    """Flaky jobs (>=2 attempts, both passing and failing) in the window."""
    store = await get_store()
    rows = await store.get_flakes(repo, job_name=job_name, days=days)
    return [{"job_name": j, "passes": p, "fails": f} for (j, p, f) in rows]


@router.get("/chronic")
async def ci_chronic(
    repo: str,
    days: int = Query(14, ge=1, le=365),
    min_streak: int = Query(3, ge=1, le=90),
) -> list[dict[str, Any]]:
    """Quarantine list: >= min_streak consecutive days, 0 passes, in window."""
    store = await get_store()
    return await store.get_chronic_failures(repo, days=days, min_streak=min_streak)


@router.get("/slowest")
async def ci_slowest(
    repo: str,
    arch: Optional[str] = None,
    limit: int = Query(15, ge=1, le=200),
) -> list[dict[str, Any]]:
    """Slowest jobs by median wall time (top N)."""
    store = await get_store()
    return await store.get_slowest_jobs(repo, arch=arch, limit=limit)


@router.get("/clusters")
async def ci_clusters(
    repo: str,
    days: int = Query(30, ge=1, le=365),
) -> list[dict[str, Any]]:
    """Failure clusters by (job_name, workflow, arch), most-failed first."""
    store = await get_store()
    clusters = await store.get_failure_clusters(repo, days=days)
    return [
        {
            "job_name": c.job_name,
            "workflow": c.workflow,
            "arch": c.arch,
            "fail_count": c.fail_count,
            "last_seen": c.last_seen.isoformat(),
        }
        for c in clusters
    ]
