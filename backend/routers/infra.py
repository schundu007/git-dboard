import asyncio
from functools import partial
from typing import Optional

from fastapi import APIRouter, HTTPException

from config import settings
from services import cluster_ssh
from services import github_client as gh

router = APIRouter(prefix="/infra", tags=["infra"])


@router.get("/runners")
async def get_runners():
    try:
        return await gh.get_runners()
    except Exception as e:
        # 403 = token lacks admin:repo scope for self-hosted runners — return empty gracefully
        msg = str(e)
        if "403" in msg or "Forbidden" in msg:
            return {"runners": [], "total_count": 0, "access_denied": True,
                    "hint": "GitHub PAT needs 'manage_runners:repo' scope to list self-hosted runners"}
        raise HTTPException(status_code=503, detail=msg)


@router.get("/cluster/queue")
async def get_cluster_queue(
    scheduler: str = "slurm",
    user: Optional[str] = None,
):
    loop = asyncio.get_event_loop()
    fn = partial(cluster_ssh.get_cluster_queue, scheduler, user)
    try:
        jobs = await loop.run_in_executor(None, fn)
        return {"jobs": jobs, "scheduler": scheduler}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Cluster unreachable: {e}")


@router.get("/cluster/nodes")
async def get_cluster_nodes():
    loop = asyncio.get_event_loop()
    try:
        nodes = await loop.run_in_executor(None, cluster_ssh.get_cluster_nodes)
        return {"nodes": nodes}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Cluster unreachable: {e}")


@router.delete("/cluster/jobs/{job_id}")
async def cancel_job(job_id: str, scheduler: str = "slurm"):
    loop = asyncio.get_event_loop()
    try:
        ok = await loop.run_in_executor(None, partial(cluster_ssh.cancel_job, job_id, scheduler))
        return {"cancelled": ok, "job_id": job_id}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/cluster/jobs/{job_id}/output")
async def get_job_output(job_id: str):
    loop = asyncio.get_event_loop()
    try:
        output = await loop.run_in_executor(None, partial(cluster_ssh.get_job_output, job_id))
        return {"job_id": job_id, "output": output}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/active-runners")
async def get_active_runners():
    """Return runner names extracted from recent job executions across key workflows.
    Used when the PAT lacks manage_runners:repo scope — shows at least which
    runners have recently been active."""
    # Fetch actual workflow files from the active repo dynamically
    try:
        wf_data = await gh.get_workflows()
        all_workflows = [w.get("path", "").split("/")[-1] for w in wf_data.get("workflows", [])]
        workflows = all_workflows[:6] if all_workflows else []
    except Exception:
        workflows = []
    seen: dict[str, dict] = {}

    async def fetch_run_jobs(workflow: str):
        try:
            data = await gh.get_workflow_runs(workflow, per_page=3)
            runs = data.get("workflow_runs", [])
            results = []
            for run in runs[:2]:
                jobs_data = await gh.get_run_jobs(run["id"])
                results.append((run, jobs_data.get("jobs", [])))
            return results
        except Exception:
            return []

    all_results = await asyncio.gather(*[fetch_run_jobs(w) for w in workflows])

    for workflow_results in all_results:
        for run, jobs in workflow_results:
            for job in jobs:
                runner = job.get("runner_name", "")
                if not runner or "GitHub Actions" in runner:
                    continue
                if runner not in seen:
                    seen[runner] = {
                        "name": runner,
                        "runner_group": job.get("runner_group_name", ""),
                        "labels": job.get("labels", []),
                        "last_job": job.get("name", ""),
                        "last_run_url": run.get("html_url", ""),
                        "last_run_date": run.get("created_at", "")[:10],
                        "last_conclusion": job.get("conclusion") or job.get("status", ""),
                        "workflow": run.get("path", "").split("/")[-1],
                        "busy": job.get("status") in ("in_progress", "queued"),
                    }

    runners = sorted(seen.values(), key=lambda r: r["last_run_date"], reverse=True)
    is_gpu = lambda r: any("gpu" in lbl.lower() for lbl in r.get("labels", []))
    return {
        "runners": runners,
        "total": len(runners),
        "gpu_runners": [r for r in runners if is_gpu(r)],
        "source": "job_history",
    }


@router.get("/live-runs")
async def get_live_runs():
    """Return currently in-progress workflow runs with per-job runner info."""
    try:
        runs = await gh.get_live_runs(per_page=20)
        return {"runs": runs, "count": len(runs)}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/status")
async def infra_status():
    status: dict = {
        "github_runners": "unknown",
        "cluster": "unknown",
        "cluster_host": settings.CLUSTER_HOST or "not configured",
        "runner_source": "live",
    }

    try:
        runners = await gh.get_runners()
        if runners.get("access_denied"):
            # PAT lacks manage_runners:repo — fall back to job history count
            raise PermissionError("access_denied")
        online = sum(1 for r in runners.get("runners", []) if r["status"] == "online")
        total = runners.get("total_count", 0)
        status["github_runners"] = f"{online}/{total} online"
    except PermissionError:
        status["github_runners"] = "no_scope"
        status["runner_source"] = "history"
    except Exception:
        status["github_runners"] = "error"
        status["runner_source"] = "history"

    loop = asyncio.get_event_loop()
    try:
        reachable = await loop.run_in_executor(None, cluster_ssh.ping)
        status["cluster"] = "connected" if reachable else "unreachable"
    except Exception:
        status["cluster"] = "unreachable"

    return status
