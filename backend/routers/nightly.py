import asyncio
from fastapi import APIRouter, HTTPException
from typing import Optional

from services import github_client as gh

router = APIRouter(prefix="/nightly", tags=["nightly"])

_SKIP_JOBS = {"setup-versions", "notify-compatibility-status", "combine-compat-results", "combine-results"}


async def _nightly_workflow() -> str | None:
    wf = await gh.get_primary_workflows()
    return wf["nightly"] or wf["ci"]


@router.get("/runs")
async def list_nightly_runs(per_page: int = 30, page: int = 1):
    wf = await _nightly_workflow()
    if not wf:
        return {"workflow_runs": [], "total_count": 0}
    return await gh.get_workflow_runs(wf, per_page=per_page, page=page)


@router.get("/runs/{run_id}")
async def get_nightly_run(run_id: int):
    return await gh.get_run(run_id)


@router.get("/runs/{run_id}/jobs")
async def get_nightly_jobs(run_id: int):
    return await gh.get_run_jobs(run_id)


@router.get("/matrix")
async def get_nightly_matrix(days: int = 14):
    """
    Per-job matrix:
      rows  = job names  (e.g. "test-isaaclab-tasks-compat (5.0.0)")
      cols  = dates      (YYYY-MM-DD, newest first)
      cells = {status, run_id, job_id, url}
    """
    data = await gh.get_workflow_runs(await _nightly_workflow() or "nightly.yml", per_page=min(days * 2, 100))
    runs = data.get("workflow_runs", [])

    # Deduplicate to one run per date (take the latest)
    seen_dates: dict[str, dict] = {}
    for run in runs:
        date = run["created_at"][:10]
        if date not in seen_dates:
            seen_dates[date] = run

    recent_runs = sorted(seen_dates.values(), key=lambda r: r["created_at"], reverse=True)[:days]

    async def fetch_jobs(run: dict):
        try:
            jobs_data = await gh.get_run_jobs(run["id"])
            return run, jobs_data.get("jobs", [])
        except Exception:
            return run, []

    results = await asyncio.gather(*[fetch_jobs(r) for r in recent_runs])

    matrix: dict[str, dict] = {}
    all_job_names: list[str] = []

    for run, jobs in results:
        date = run["created_at"][:10]
        matrix.setdefault(date, {})
        for job in jobs:
            name = job["name"]
            if name in _SKIP_JOBS:
                continue
            matrix[date][name] = {
                "status": job.get("conclusion") or job.get("status", "unknown"),
                "run_id": run["id"],
                "job_id": job["id"],
                "url": job.get("html_url", run["html_url"]),
                "started_at": job.get("started_at"),
                "completed_at": job.get("completed_at"),
            }
            if name not in all_job_names:
                all_job_names.append(name)

    dates = sorted(matrix.keys(), reverse=True)

    # Compute flakiness: jobs that have both success and failure in window
    flaky: list[str] = []
    for name in all_job_names:
        statuses = {matrix[d][name]["status"] for d in dates if name in matrix.get(d, {})}
        if "success" in statuses and "failure" in statuses:
            flaky.append(name)

    # Consecutive failures per job (from most recent)
    consecutive: dict[str, int] = {}
    for name in all_job_names:
        count = 0
        for d in dates:
            cell = matrix.get(d, {}).get(name)
            if cell and cell["status"] == "failure":
                count += 1
            else:
                break
        consecutive[name] = count

    return {
        "matrix": matrix,
        "dates": dates,
        "job_names": all_job_names,
        "flaky_jobs": flaky,
        "consecutive_failures": consecutive,
        "workflow": await _nightly_workflow(),
    }


@router.get("/trend")
async def get_nightly_trend(days: int = 30):
    """Daily pass-rate trend for charting."""
    data = await gh.get_workflow_runs(await _nightly_workflow() or "nightly.yml", per_page=min(days * 2, 100))
    runs = data.get("workflow_runs", [])

    by_date: dict[str, list[str]] = {}
    for r in runs:
        date = r["created_at"][:10]
        conclusion = r.get("conclusion") or r.get("status", "unknown")
        by_date.setdefault(date, []).append(conclusion)

    trend = []
    for date in sorted(by_date.keys(), reverse=True)[:days]:
        conclusions = by_date[date]
        passed = sum(1 for c in conclusions if c == "success")
        trend.append({
            "date": date,
            "passed": passed,
            "failed": len(conclusions) - passed,
            "total": len(conclusions),
            "pass_rate": round(passed / len(conclusions) * 100, 1) if conclusions else 0,
        })
    return {"trend": trend}


@router.post("/trigger")
async def trigger_nightly(ref: str = "main"):
    wf = await _nightly_workflow()
    if not wf:
        raise HTTPException(status_code=404, detail="No nightly/CI workflow found for this repo")
    try:
        await gh.trigger_workflow(wf, ref=ref)
        return {"status": "triggered", "workflow": wf, "ref": ref}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/image-matrix")
async def get_nightly_image_matrix():
    """
    Image publish status from the active repo's publish workflow.
    Returns per-job breakdown and per-date history.
    """
    wf = await gh.get_primary_workflows()
    publish_wf = wf["publish"]

    if not publish_wf:
        return {"jobs": [], "history": [], "run_date": None, "run_url": None, "no_data": True, "source": None}

    try:
        data = await gh.get_workflow_runs(publish_wf, per_page=20)
        publish_runs = data.get("workflow_runs", [])
    except Exception:
        publish_runs = []

    if not publish_runs:
        return {"jobs": [], "history": [], "run_date": None, "run_url": None, "no_data": True, "source": publish_wf}

    latest_run = publish_runs[0]

    try:
        jobs_data = await gh.get_run_jobs(latest_run["id"])
        latest_jobs = jobs_data.get("jobs", [])
    except Exception:
        latest_jobs = []

    jobs = [
        {
            "name": j.get("name", ""),
            "status": j.get("conclusion") or j.get("status", "in_progress"),
            "url": j.get("html_url", latest_run["html_url"]),
            "job_id": j.get("id"),
        }
        for j in latest_jobs
    ]

    history = [
        {
            "date": r.get("created_at", "")[:10],
            "status": r.get("conclusion") or r.get("status", "in_progress"),
            "url": r.get("html_url", ""),
            "title": r.get("display_title", ""),
        }
        for r in publish_runs[:10]
    ]

    return {
        "jobs": jobs,
        "history": history,
        "run_date": latest_run.get("created_at", "")[:10],
        "run_url": latest_run.get("html_url", ""),
        "source": publish_wf,
        "no_data": False,
    }


@router.get("/yaml")
async def get_nightly_matrix_yaml():
    """Return the generated nightly-build GitHub Actions workflow YAML."""
    yaml_content = """\
name: nightly-build

on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:

jobs:
  build:
    name: build (${{ matrix.isaac_sim_version }}, ${{ matrix.image_ext }})
    runs-on: [self-hosted, gpu, nvidia-driver]
    fail-fast: false
    strategy:
      matrix:
        isaac_sim_version: ["4.5.0", "5.0.0", "5.1.0"]
        image_ext: [base, ros2, cloudxr, ngc-slim]

    steps:
      - uses: actions/checkout@v4

      - name: Build image
        env:
          ISAAC_SIM_VERSION: ${{ matrix.isaac_sim_version }}
          IMAGE_EXT: ${{ matrix.image_ext }}
        run: |
          python docker/container.py \\
            --version $ISAAC_SIM_VERSION \\
            --ext $IMAGE_EXT \\
            --tag nightly-$(date +%Y%m%d)-${IMAGE_EXT}-sim${ISAAC_SIM_VERSION%.*}

      - name: Export build manifest
        run: python docker/container.py manifest > manifest.json

      - uses: actions/upload-artifact@v4
        with:
          name: manifest-${{ matrix.isaac_sim_version }}-${{ matrix.image_ext }}
          path: manifest.json

      - name: Dispatch registry push
        uses: peter-evans/repository-dispatch@v3
        with:
          event-type: nightly-push
          client-payload: >-
            {
              "isaac_sim_version": "${{ matrix.isaac_sim_version }}",
              "image_ext": "${{ matrix.image_ext }}"
            }
"""
    return {"yaml": yaml_content}
