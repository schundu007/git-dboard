"""
Builds router — workflow runs, job details, artifacts, cancel, rerun,
live log streaming, and aggregate pipeline statistics.
"""
import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from services import github_client as gh

router = APIRouter(prefix="/builds", tags=["builds"])

# Human-readable workflow names (filename → display name)
WORKFLOW_LABELS: dict[str, str] = {
    "postmerge-ci.yml": "Post-Merge CI",
    "build.yml": "Build & Test",
    "build2.yml": "Build & Test v2",
    "publish-images.yaml": "Publish Docker Images",
    "install-ci.yml": "Installation Tests",
    "lightweight-tests.yml": "Lightweight Tests",
    "lightweight-tests-no-gpu.yml": "Lightweight Tests (no GPU)",
    "license-check.yaml": "Python Dependency Licenses Check",
    "check-links.yml": "Check Documentation Links",
    "pre-commit.yaml": "Run `pre-commit`",
    "wheel.yml": "Build PIP Wheel",
    "validate-multiarch-build.yml": "Validate Multiarch Build",
    "daily-compatibility.yml": "Nightly Compatibility",
    "nightly-changelog.yml": "Nightly Changelog Compilation",
    "docs.yaml": "Docs",
    "docs-dev.yaml": "Docs (dev)",
    "docs-release.yaml": "Docs (release)",
    "copilot-review.yaml": "Copilot code review",
    "copilot-review.yml": "Copilot code review",
    "pr-labeler.yml": "Pull Request Labeler",
    "pr-labeler.yaml": "Pull Request Labeler",
    "changelog-check.yml": "Changelog Fragment Check",
    "changelog-check.yaml": "Changelog Fragment Check",
    "debug-ecr.yml": "Debug ECR",
    "dependency-graph.yml": "Dependency Graph",
    "fabric-multi-gpu.yml": "FabricFrameView Multi-GPU Tests",
    "hello-world.yml": "Hello World",
    "backwards-compat.yml": "Backwards Compatibility Tests",
    "multi-gpu-training.yml": "Multi-GPU Training Tests",
    "pages-build-deployment": "pages-build-deployment",
}

# Workflows shown in the UI selector (filename → label)
PINNED_WORKFLOWS = {
    "postmerge-ci.yml": "Post-Merge CI",
    "build.yml": "Build & Test",
    "publish-images.yaml": "Publish Images",
    "install-ci.yml": "Installation Tests",
    "lightweight-tests.yml": "Lightweight Tests",
    "license-check.yaml": "License Check",
    "check-links.yml": "Link Check",
    "pre-commit.yaml": "Pre-commit",
}


def _duration_seconds(run: dict) -> Optional[int]:
    start = run.get("run_started_at") or run.get("created_at")
    end = run.get("updated_at")
    if not start or not end:
        return None
    try:
        s = datetime.fromisoformat(start.replace("Z", "+00:00"))
        e = datetime.fromisoformat(end.replace("Z", "+00:00"))
        return max(0, int((e - s).total_seconds()))
    except Exception:
        return None


def _fmt_duration(secs: Optional[int]) -> str:
    if secs is None:
        return "—"
    if secs < 60:
        return f"{secs}s"
    return f"{secs // 60}m {secs % 60}s"


def _enrich_run(run: dict) -> dict:
    secs = _duration_seconds(run)
    return {
        **run,
        "duration_seconds": secs,
        "duration_label": _fmt_duration(secs),
        "workflow_label": WORKFLOW_LABELS.get(
            (run.get("path") or run.get("name") or "").split("/")[-1],
            run.get("name", ""),
        ),
    }


# ── Workflow list ─────────────────────────────────────────────────────────────

@router.get("/workflows")
async def list_workflows():
    data = await gh.get_workflows()
    wfs = data.get("workflows", [])
    result = []
    for w in wfs:
        path = w.get("path", "").split("/")[-1]
        label = WORKFLOW_LABELS.get(path, w["name"])
        result.append({
            "id": w["id"],
            "name": label,
            "filename": path,
            "state": w["state"],
            "pinned": path in PINNED_WORKFLOWS,
        })
    return {"workflows": result}


# ── Run listing ───────────────────────────────────────────────────────────────

@router.get("/runs")
async def list_runs(
    workflow: Optional[str] = None,
    per_page: int = 25,
    page: int = 1,
    branch: Optional[str] = None,
    status: Optional[str] = None,  # success | failure | in_progress | cancelled
):
    if not workflow:
        wf = await gh.get_primary_workflows()
        workflow = wf["ci"] or ""
    if not workflow:
        return {"total_count": 0, "workflow_runs": []}
    data = await gh.get_workflow_runs(workflow, per_page=per_page, page=page, branch=branch)
    runs = data.get("workflow_runs", [])
    if status:
        if status == "in_progress":
            runs = [r for r in runs if r.get("status") == "in_progress"]
        else:
            runs = [r for r in runs if r.get("conclusion") == status]
    return {
        "total_count": data.get("total_count", 0),
        "workflow_runs": [_enrich_run(r) for r in runs],
    }


@router.get("/runs/all")
async def list_all_runs(
    per_page: int = 30,
    page: int = 1,
    branch: Optional[str] = None,
    event: Optional[str] = None,
    status: Optional[str] = None,
    actor: Optional[str] = None,
):
    """All workflow runs across every workflow — supports multi-filter (event, actor, status, branch)."""
    data = await gh.get_all_runs(
        per_page=per_page, page=page,
        branch=branch or None,
        event=event or None,
        status=status or None,
        actor=actor or None,
    )
    runs = data.get("workflow_runs", [])
    return {
        "total_count": data.get("total_count", 0),
        "workflow_runs": [_enrich_run(r) for r in runs],
        "in_progress_count": sum(1 for r in runs if r.get("status") in ("in_progress", "queued")),
    }


@router.get("/runs/{run_id}")
async def get_run(run_id: int):
    run = await gh.get_run(run_id)
    return _enrich_run(run)


@router.get("/runs/{run_id}/jobs")
async def get_run_jobs(run_id: int):
    data = await gh.get_run_jobs(run_id)
    jobs = data.get("jobs", [])
    enriched = []
    for j in jobs:
        secs = None
        start = j.get("started_at")
        end = j.get("completed_at")
        if start and end:
            try:
                s = datetime.fromisoformat(start.replace("Z", "+00:00"))
                e = datetime.fromisoformat(end.replace("Z", "+00:00"))
                secs = max(0, int((e - s).total_seconds()))
            except Exception:
                pass
        enriched.append({**j, "duration_seconds": secs, "duration_label": _fmt_duration(secs)})
    return {"jobs": enriched, "total_count": len(enriched)}


@router.get("/runs/{run_id}/artifacts")
async def get_run_artifacts(run_id: int):
    data = await gh.get_run_artifacts(run_id)
    artifacts = data.get("artifacts", [])
    return {
        "artifacts": [
            {
                "id": a["id"],
                "name": a["name"],
                "size_kb": round(a["size_in_bytes"] / 1024, 1),
                "expired": a["expired"],
                "created_at": a.get("created_at"),
                "expires_at": a.get("expires_at"),
                "url": a.get("archive_download_url", ""),
            }
            for a in artifacts
        ],
        "total_count": data.get("total_count", 0),
    }


@router.get("/runs/{run_id}/failure-summary")
async def get_failure_summary(run_id: int):
    """
    For a failed run: which jobs/steps failed and extracted error lines from logs.
    Cap at 3 failed jobs, 8 error lines each to keep response fast.
    """
    jobs_data = await gh.get_run_jobs(run_id)
    jobs = jobs_data.get("jobs", [])
    failed_jobs = [j for j in jobs if j.get("conclusion") in ("failure", "timed_out")]

    summaries = []
    for job in failed_jobs[:3]:
        failed_steps = [
            {"number": s["number"], "name": s["name"]}
            for s in job.get("steps", [])
            if s.get("conclusion") == "failure"
        ]
        logs = await gh.get_job_logs(job["id"])
        error_lines: list[str] = []
        if logs:
            lines = logs.splitlines()
            for line in lines:
                stripped = line.strip()
                # Strip GitHub Actions timestamp prefix (e.g. "2024-01-01T00:00:00.0000000Z ")
                if len(stripped) > 28 and stripped[4] == "-":
                    stripped = stripped[28:].strip()
                low = stripped.lower()
                if any(k in low for k in ["error:", "##[error]", "failed:", "exception:", "traceback", "exitcode", "exit code"]):
                    if stripped and stripped not in error_lines:
                        error_lines.append(stripped[:250])
                if len(error_lines) >= 8:
                    break
            # Fallback: last 10 non-empty lines
            if not error_lines:
                tail = [l.strip() for l in lines[-60:] if l.strip()]
                for l in tail[-10:]:
                    if len(l) > 28 and l[4] == "-":
                        l = l[28:].strip()
                    error_lines.append(l[:250])

        summaries.append({
            "job": job["name"],
            "runner": job.get("runner_name", ""),
            "failed_steps": failed_steps,
            "error_lines": error_lines[:8],
        })

    return {
        "run_id": run_id,
        "failed_jobs": len(failed_jobs),
        "summaries": summaries,
    }


# ── Actions ───────────────────────────────────────────────────────────────────

@router.post("/trigger")
async def trigger_build(ref: str = "main", workflow: Optional[str] = None):
    if not workflow:
        wf = await gh.get_primary_workflows()
        workflow = wf["ci"] or ""
    if not workflow:
        raise HTTPException(status_code=404, detail="No CI workflow found for this repo")
    try:
        await gh.trigger_workflow(workflow, ref=ref)
        label = WORKFLOW_LABELS.get(workflow, workflow)
        return {"status": "triggered", "workflow": label, "ref": ref}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/runs/{run_id}/rerun")
async def rerun_run(run_id: int):
    try:
        await gh.rerun_workflow(run_id)
        return {"status": "rerunning", "run_id": run_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/runs/{run_id}/rerun-failed")
async def rerun_failed(run_id: int):
    try:
        await gh.rerun_failed_jobs(run_id)
        return {"status": "rerunning-failed-jobs", "run_id": run_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: int):
    try:
        ok = await gh.cancel_run(run_id)
        return {"cancelled": ok, "run_id": run_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Pipeline statistics ───────────────────────────────────────────────────────

@router.get("/stats")
async def pipeline_stats(workflow: Optional[str] = None, limit: int = 50, days: Optional[int] = None):
    """
    Aggregate statistics for a workflow:
    success rate, avg/p50/p90 duration, failure rate by day,
    most common failure jobs.
    If `days` is provided, filter runs to the last N calendar days.
    """
    if not workflow:
        wf = await gh.get_primary_workflows()
        workflow = wf["ci"] or ""
    if not workflow:
        return {"total_count": 0, "runs": [], "success_rate": 0, "avg_duration_sec": 0}
    per_page = min(limit, 100) if days is None else 100
    data = await gh.get_workflow_runs(workflow, per_page=per_page)
    runs = data.get("workflow_runs", [])

    if days is not None:
        cutoff = (datetime.now(timezone.utc) - __import__('datetime').timedelta(days=days)).isoformat()
        from datetime import timedelta
        cutoff_dt = datetime.now(timezone.utc) - timedelta(days=days)
        cutoff = cutoff_dt.isoformat()
        runs = [r for r in runs if r.get("created_at", "") >= cutoff]

    durations: list[int] = []
    success = failure = cancelled = other = 0
    by_day: dict[str, dict] = {}
    actors: dict[str, int] = {}

    for r in runs:
        c = r.get("conclusion") or r.get("status", "")
        if c == "success":
            success += 1
        elif c in ("failure", "timed_out"):
            failure += 1
        elif c == "cancelled":
            cancelled += 1
        else:
            other += 1

        secs = _duration_seconds(r)
        if secs is not None and r.get("conclusion") == "success":
            durations.append(secs)

        date = r["created_at"][:10]
        if date not in by_day:
            by_day[date] = {"date": date, "success": 0, "failure": 0, "total": 0}
        by_day[date]["total"] += 1
        if c == "success":
            by_day[date]["success"] += 1
        elif c in ("failure", "timed_out"):
            by_day[date]["failure"] += 1

        actor = (r.get("triggering_actor") or r.get("actor") or {}).get("login", "unknown")
        actors[actor] = actors.get(actor, 0) + 1

    total = len(runs)
    durations.sort()
    n = len(durations)

    def _pct(lst, p):
        if not lst:
            return None
        return lst[int(len(lst) * p)]

    return {
        "workflow": WORKFLOW_LABELS.get(workflow, workflow),
        "total": total,
        "success": success,
        "failure": failure,
        "cancelled": cancelled,
        "success_rate": round(success / total * 100, 1) if total else None,
        "failure_rate": round(failure / total * 100, 1) if total else None,
        "duration": {
            "avg_seconds": round(sum(durations) / n) if n else None,
            "p50_seconds": _pct(durations, 0.5),
            "p90_seconds": _pct(durations, 0.9),
            "avg_label": _fmt_duration(round(sum(durations) / n) if n else None),
            "p50_label": _fmt_duration(_pct(durations, 0.5)),
            "p90_label": _fmt_duration(_pct(durations, 0.9)),
        },
        "by_day": sorted(by_day.values(), key=lambda x: x["date"])[-14:],
        "top_actors": sorted(
            [{"login": k, "count": v} for k, v in actors.items()],
            key=lambda x: x["count"],
            reverse=True,
        )[:8],
        "in_progress": sum(1 for r in runs if r.get("status") == "in_progress"),
        "runs_analysed": total,
    }


# ── WebSocket log stream ──────────────────────────────────────────────────────

@router.websocket("/runs/{run_id}/logs/stream")
async def stream_build_logs(websocket: WebSocket, run_id: int):
    await websocket.accept()
    try:
        jobs_data = await gh.get_run_jobs(run_id)
        for job in jobs_data.get("jobs", []):
            logs = await gh.get_job_logs(job["id"])
            if logs:
                for line in logs.splitlines():
                    await websocket.send_json({"job": job["name"], "line": line})
                    await asyncio.sleep(0.001)
        await websocket.send_json({"done": True})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"error": str(e)})


# ── Caches ────────────────────────────────────────────────────────────────────

def _fmt_size(b: int) -> str:
    if b < 1024:
        return f"{b}B"
    if b < 1024 ** 2:
        return f"{b / 1024:.1f}KB"
    if b < 1024 ** 3:
        return f"{b / 1024 ** 2:.1f}MB"
    return f"{b / 1024 ** 3:.2f}GB"


@router.get("/caches")
async def list_caches(ref: Optional[str] = None, key: Optional[str] = None):
    """List all GitHub Actions caches with aggregate stats grouped by branch."""
    data = await gh.get_caches(per_page=100, ref=ref, key=key)
    caches = data.get("actions_caches", [])

    total_size = sum(c.get("size_in_bytes", 0) for c in caches)
    by_ref: dict[str, dict] = {}
    for c in caches:
        ref_name = c.get("ref", "").replace("refs/heads/", "").replace("refs/pull/", "PR#").replace("/merge", "")
        if ref_name not in by_ref:
            by_ref[ref_name] = {"ref": ref_name, "count": 0, "size_bytes": 0}
        by_ref[ref_name]["count"] += 1
        by_ref[ref_name]["size_bytes"] += c.get("size_in_bytes", 0)

    by_ref_list = sorted(by_ref.values(), key=lambda x: x["size_bytes"], reverse=True)[:15]
    for row in by_ref_list:
        row["size_label"] = _fmt_size(row["size_bytes"])

    return {
        "total_count": data.get("total_count", 0),
        "total_size_bytes": total_size,
        "total_size_label": _fmt_size(total_size),
        "by_ref": by_ref_list,
        "caches": [
            {
                "id": c["id"],
                "key": c.get("key", ""),
                "ref": c.get("ref", "").replace("refs/heads/", "").replace("refs/pull/", "PR#").replace("/merge", ""),
                "version": c.get("version", ""),
                "size_bytes": c.get("size_in_bytes", 0),
                "size_label": _fmt_size(c.get("size_in_bytes", 0)),
                "created_at": c.get("created_at"),
                "last_accessed_at": c.get("last_accessed_at"),
            }
            for c in caches
        ],
    }


@router.delete("/caches/{cache_id}")
async def delete_cache(cache_id: int):
    try:
        ok = await gh.delete_cache(cache_id)
        return {"deleted": ok, "cache_id": cache_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Deployments ───────────────────────────────────────────────────────────────

@router.get("/deployments")
async def list_deployments(
    environment: Optional[str] = None,
    ref: Optional[str] = None,
    per_page: int = 30,
    page: int = 1,
):
    """List deployments enriched with their latest status."""
    deployments = await gh.get_deployments(
        per_page=min(per_page, 100), environment=environment, ref=ref, page=page
    )
    if not isinstance(deployments, list):
        return {"deployments": [], "total": 0, "environments": []}

    async def _with_status(d: dict) -> dict:
        try:
            statuses = await gh.get_deployment_statuses(d["id"])
            latest = statuses[0] if statuses else {}
        except Exception:
            latest = {}
        return {
            "id": d["id"],
            "ref": d.get("ref", ""),
            "sha": d.get("sha", "")[:7],
            "task": d.get("task", "deploy"),
            "environment": d.get("environment", ""),
            "description": (d.get("description") or "")[:100],
            "creator": (d.get("creator") or {}).get("login", ""),
            "creator_avatar": (d.get("creator") or {}).get("avatar_url", ""),
            "created_at": d.get("created_at"),
            "status": latest.get("state", "pending"),
            "log_url": latest.get("log_url") or latest.get("target_url", ""),
            "environment_url": latest.get("environment_url", ""),
        }

    enriched = await asyncio.gather(*[_with_status(d) for d in deployments[:50]])
    return {
        "deployments": list(enriched),
        "total": len(deployments),
        "environments": sorted({d.get("environment", "") for d in deployments if d.get("environment")}),
    }


@router.get("/environments")
async def list_environments():
    """List all GitHub Actions environments with their protection rules."""
    data = await gh.get_environments()
    envs = data.get("environments", [])
    return {
        "environments": [
            {
                "id": e["id"],
                "name": e["name"],
                "url": e.get("html_url", ""),
                "created_at": e.get("created_at"),
                "updated_at": e.get("updated_at"),
                "protection_rules": [
                    {"type": r.get("type"), "id": r.get("id")}
                    for r in e.get("protection_rules", [])
                ],
                "deployment_branch_policy": e.get("deployment_branch_policy"),
            }
            for e in envs
        ],
        "total_count": data.get("total_count", len(envs)),
    }


# ── Usage / billable minutes ──────────────────────────────────────────────────

@router.get("/usage")
async def workflow_usage():
    """Per-workflow usage: billable minutes (GitHub-hosted) + actual wall-clock from recent runs."""
    wf_data = await gh.get_workflows()
    workflows = [w for w in wf_data.get("workflows", []) if w.get("state") == "active"][:20]

    async def _get_timing(w: dict) -> dict:
        path = w.get("path", "").split("/")[-1]
        label = WORKFLOW_LABELS.get(path, w["name"])

        # Billable minutes — only non-zero for GitHub-hosted runners
        try:
            timing = await gh.get_workflow_timing(str(w["id"]))
            billable = timing.get("billable", {})
            ubuntu_ms = (billable.get("UBUNTU") or {}).get("total_ms", 0)
            macos_ms = (billable.get("MACOS") or {}).get("total_ms", 0)
            windows_ms = (billable.get("WINDOWS") or {}).get("total_ms", 0)
            ubuntu_jobs = (billable.get("UBUNTU") or {}).get("jobs", 0)
            total_ms = ubuntu_ms + macos_ms + windows_ms
        except Exception:
            ubuntu_ms = macos_ms = windows_ms = total_ms = ubuntu_jobs = 0

        # Actual wall-clock time from the last 30 completed runs
        actual_seconds = 0.0
        run_count = 0
        success_count = 0
        try:
            runs_data = await gh.get_workflow_runs(str(w["id"]), per_page=30)
            for run in runs_data.get("workflow_runs", []):
                if run.get("status") != "completed":
                    continue
                start_str = run.get("run_started_at") or run.get("created_at")
                end_str = run.get("updated_at")
                if start_str and end_str:
                    try:
                        start = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
                        end = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
                        dur = (end - start).total_seconds()
                        if 0 < dur < 86400:
                            actual_seconds += dur
                            run_count += 1
                            if run.get("conclusion") == "success":
                                success_count += 1
                    except Exception:
                        pass
        except Exception:
            pass

        avg_seconds = round(actual_seconds / run_count) if run_count else 0
        return {
            "id": w["id"],
            "name": label,
            "filename": path,
            "ubuntu_min": round(ubuntu_ms / 60000, 1),
            "macos_min": round(macos_ms / 60000, 1),
            "windows_min": round(windows_ms / 60000, 1),
            "total_min": round(total_ms / 60000, 1),
            "ubuntu_jobs": ubuntu_jobs,
            "actual_min": round(actual_seconds / 60, 1),
            "avg_min": round(avg_seconds / 60, 1),
            "run_count": run_count,
            "success_count": success_count,
        }

    results = await asyncio.gather(*[_get_timing(w) for w in workflows])
    all_billable_zero = all(r["total_min"] == 0 for r in results)
    # Sort by actual time when billable is all zero, else by billable
    sort_key = "actual_min" if all_billable_zero else "total_min"
    results = sorted(results, key=lambda x: x[sort_key], reverse=True)
    total_min = sum(r["total_min"] for r in results)
    total_actual_min = sum(r["actual_min"] for r in results)
    return {
        "workflows": results,
        "total_min": round(total_min, 1),
        "total_actual_min": round(total_actual_min, 1),
        "total_ubuntu_min": round(sum(r["ubuntu_min"] for r in results), 1),
        "total_macos_min": round(sum(r["macos_min"] for r in results), 1),
        "self_hosted": all_billable_zero,
    }


# ── Performance metrics ───────────────────────────────────────────────────────

@router.get("/performance")
async def workflow_performance(days: int = 14):
    """Cross-workflow performance comparison: success rate + duration percentiles for all pinned workflows."""
    from datetime import timedelta
    workflows = list(PINNED_WORKFLOWS.keys())
    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=days)
    cutoff = cutoff_dt.isoformat()

    async def _get_stats(wf: str) -> dict:
        label = WORKFLOW_LABELS.get(wf, wf)
        try:
            data = await gh.get_workflow_runs(wf, per_page=100)
            runs = [r for r in data.get("workflow_runs", []) if r.get("created_at", "") >= cutoff]
            durations, success, failure, cancelled = [], 0, 0, 0
            for r in runs:
                c = r.get("conclusion") or r.get("status", "")
                if c == "success":
                    success += 1
                elif c in ("failure", "timed_out"):
                    failure += 1
                elif c == "cancelled":
                    cancelled += 1
                secs = _duration_seconds(r)
                if secs and c == "success":
                    durations.append(secs)
            durations.sort()
            n = len(durations)
            total = success + failure + cancelled
            sf = success + failure
            return {
                "workflow": label,
                "filename": wf,
                "total": total,
                "success": success,
                "failure": failure,
                "cancelled": cancelled,
                "success_rate": round(success / sf * 100, 1) if sf else None,
                "avg_seconds": round(sum(durations) / n) if n else None,
                "p50_seconds": durations[n // 2] if n else None,
                "p90_seconds": durations[int(n * 0.9)] if n else None,
                "avg_label": _fmt_duration(round(sum(durations) / n) if n else None),
                "p50_label": _fmt_duration(durations[n // 2] if n else None),
                "p90_label": _fmt_duration(durations[int(n * 0.9)] if n else None),
            }
        except Exception:
            return {"workflow": label, "filename": wf, "total": 0, "success": 0, "failure": 0, "cancelled": 0,
                    "success_rate": None, "avg_seconds": None, "avg_label": "—", "p50_label": "—", "p90_label": "—"}

    results = await asyncio.gather(*[_get_stats(wf) for wf in workflows])
    active = [r for r in results if r["total"] > 0]
    active.sort(key=lambda x: -(x["avg_seconds"] or 0))
    return {"workflows": active, "all": list(results), "days": days}


# ── Workflow last-run index ────────────────────────────────────────────────────

@router.get("/workflows/status")
async def workflows_with_status():
    """All workflows with their latest run status — for the full workflow list view."""
    wf_data, runs_data = await asyncio.gather(
        gh.get_workflows(),
        gh.get_all_runs(per_page=100),
    )
    workflows = wf_data.get("workflows", [])
    runs = runs_data.get("workflow_runs", [])

    # Index latest run per workflow (by workflow name since we don't have workflow_id on runs easily)
    latest_by_name: dict[str, dict] = {}
    for r in runs:
        name = r.get("name", "")
        if name not in latest_by_name:
            latest_by_name[name] = r

    result = []
    for w in workflows:
        path = (w.get("path") or "").split("/")[-1]
        label = WORKFLOW_LABELS.get(path, w["name"])
        latest = latest_by_name.get(w["name"], {})
        result.append({
            "id": w["id"],
            "name": label,
            "filename": path,
            "state": w.get("state", "active"),
            "pinned": path in PINNED_WORKFLOWS,
            "last_status": latest.get("conclusion") or latest.get("status"),
            "last_run_at": latest.get("created_at"),
            "last_branch": latest.get("head_branch"),
            "last_run_id": latest.get("id"),
            "html_url": w.get("html_url", ""),
        })

    result.sort(key=lambda x: (not x["pinned"], x["name"].lower()))
    return {"workflows": result, "total": len(result)}
