import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from services import github_client as gh
from services import log_store

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("")
async def get_logs(
    source: Optional[str] = None,
    run_id: Optional[str] = None,
    level: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 500,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    repo_slug = gh.get_active_repo_slug()
    entries = await log_store.get_logs(
        db, source=source, run_id=run_id, level=level, search=search,
        limit=limit, offset=offset, repo_slug=repo_slug,
    )
    return [
        {
            "id": e.id,
            "source": e.source,
            "run_id": e.run_id,
            "level": e.level,
            "message": e.message,
            "timestamp": (e.timestamp.isoformat() + "Z") if e.timestamp else None,
            "meta": e.meta or {},
        }
        for e in entries
    ]


@router.post("/ingest/gha/{run_id}")
async def ingest_gha_logs(run_id: int, db: AsyncSession = Depends(get_db)):
    """Pull GHA job logs and store them in local SQLite."""
    jobs_data = await gh.get_run_jobs(run_id)
    ingested = 0
    for job in jobs_data.get("jobs", []):
        logs = await gh.get_job_logs(job["id"])
        for line in logs.splitlines():
            line = line.strip()
            if not line:
                continue
            low = line.lower()
            level = "ERROR" if "error" in low else "WARNING" if "warn" in low else "INFO"
            await log_store.save_log(
                db, "gha", str(run_id), level, line, {"job": job["name"]},
                repo_slug=gh.get_active_repo_slug(),
            )
            ingested += 1
    return {"ingested": ingested, "run_id": run_id}


@router.delete("/purge")
async def purge_logs(days: int = 30, db: AsyncSession = Depends(get_db)):
    removed = await log_store.purge_old_logs(db, days=days)
    return {"status": "purged", "removed": removed, "older_than_days": days}


@router.websocket("/stream")
async def stream_logs_ws(websocket: WebSocket, run_id: int):
    """Live-stream GHA run logs, polling every 5 s until the run completes."""
    await websocket.accept()
    seen_jobs: set[int] = set()
    try:
        while True:
            jobs_data = await gh.get_run_jobs(run_id)
            run = await gh.get_run(run_id)

            for job in jobs_data.get("jobs", []):
                job_id = job["id"]
                if job_id not in seen_jobs and job["status"] in ("completed", "in_progress"):
                    logs = await gh.get_job_logs(job_id)
                    if logs:
                        for line in logs.splitlines():
                            await websocket.send_json(
                                {"job": job["name"], "line": line}
                            )
                    seen_jobs.add(job_id)

            if run.get("status") in ("completed", "failure", "cancelled"):
                await websocket.send_json(
                    {"done": True, "conclusion": run.get("conclusion")}
                )
                break

            await asyncio.sleep(5)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"error": str(e)})
        except Exception:
            pass
