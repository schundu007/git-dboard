import asyncio
from fastapi import APIRouter, HTTPException
from typing import Optional

from services import github_client as gh

router = APIRouter(prefix="/nightly", tags=["nightly"])

# Primary CI workflow (build.yml = "Build and Test", 4000+ runs).
# daily-compatibility.yml was disabled; build.yml is the active per-PR/push matrix.
_WORKFLOW = "build.yml"

_SKIP_JOBS = {"setup-versions", "notify-compatibility-status", "combine-compat-results", "combine-results"}

ISAAC_SIM_VERSIONS = ["4.5.0", "5.0.0", "5.1.0"]
IMAGE_EXTS = ["base", "ros2", "cloudxr", "ngc-slim"]
_SHORT_VER = {v: v[:3] for v in ISAAC_SIM_VERSIONS}  # "4.5.0" → "4.5"


@router.get("/runs")
async def list_nightly_runs(per_page: int = 30, page: int = 1):
    return await gh.get_workflow_runs(_WORKFLOW, per_page=per_page, page=page)


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
    data = await gh.get_workflow_runs(_WORKFLOW, per_page=min(days * 2, 100))
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
        "workflow": _WORKFLOW,
    }


@router.get("/trend")
async def get_nightly_trend(days: int = 30):
    """Daily pass-rate trend for charting."""
    data = await gh.get_workflow_runs(_WORKFLOW, per_page=min(days * 2, 100))
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
    try:
        await gh.trigger_workflow(_WORKFLOW, ref=ref)
        return {"status": "triggered", "workflow": _WORKFLOW, "ref": ref}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/image-matrix")
async def get_nightly_image_matrix():
    """
    Image publish status matrix sourced from publish-images.yaml.
    Shows last N runs (by date) × extension × sim-version.
    Since publish-images uses a single aggregated job, we reflect the
    overall run conclusion per date and tag the row with known extensions.
    """
    short_versions = [_SHORT_VER[v] for v in ISAAC_SIM_VERSIONS]
    empty_matrix = {ext: {v: None for v in short_versions} for ext in IMAGE_EXTS}

    # Fetch recent publish-images runs (the actual Docker push workflow)
    try:
        data = await gh.get_workflow_runs("publish-images.yaml", per_page=20)
        publish_runs = data.get("workflow_runs", [])
    except Exception:
        publish_runs = []

    if not publish_runs:
        return {
            "extensions": IMAGE_EXTS,
            "sim_versions": short_versions,
            "matrix": empty_matrix,
            "run_date": None,
            "run_url": None,
            "source": "publish-images.yaml",
            "no_data": True,
        }

    latest_run = publish_runs[0]

    # Fetch jobs for the latest run to check sub-job conclusions
    try:
        jobs_data = await gh.get_run_jobs(latest_run["id"])
        latest_jobs = jobs_data.get("jobs", [])
    except Exception:
        latest_jobs = []

    # Build matrix: use the push job conclusion for each ext/version cell.
    # If the push workflow uses a matrix strategy, each job name will contain
    # ext and sim version. If not (single job), all cells get the same status.
    matrix: dict = {ext: {v: None for v in short_versions} for ext in IMAGE_EXTS}

    matched_any = False
    for job in latest_jobs:
        name = job.get("name", "")
        name_lower = name.lower()
        conclusion = job.get("conclusion") or job.get("status", "in_progress")
        url = job.get("html_url", latest_run["html_url"])

        matched_ext = next((ext for ext in IMAGE_EXTS if ext in name_lower), None)
        matched_ver = None
        for full_ver in ISAAC_SIM_VERSIONS:
            short = _SHORT_VER[full_ver]
            if full_ver in name or short in name:
                matched_ver = short
                break

        if matched_ext and matched_ver:
            matrix[matched_ext][matched_ver] = {"status": conclusion, "url": url, "job_id": job.get("id")}
            matched_any = True
        elif matched_ver and not matched_ext:
            # No ext in name — put in base
            matrix["base"][matched_ver] = {"status": conclusion, "url": url, "job_id": job.get("id")}
            matched_any = True

    # If no per-job matrix matches, broadcast the run-level conclusion to all cells.
    # This covers the "single aggregated build-and-push job" pattern.
    if not matched_any:
        run_conclusion = latest_run.get("conclusion") or latest_run.get("status", "in_progress")
        run_url = latest_run.get("html_url", "")
        run_id = latest_run.get("id")
        for ext in IMAGE_EXTS:
            for v in short_versions:
                matrix[ext][v] = {"status": run_conclusion, "url": run_url, "job_id": run_id}

    # Build per-date history for the trend strip (last 10 runs)
    history = []
    for r in publish_runs[:10]:
        history.append({
            "date": r.get("created_at", "")[:10],
            "status": r.get("conclusion") or r.get("status", "in_progress"),
            "url": r.get("html_url", ""),
            "title": r.get("display_title", ""),
        })

    return {
        "extensions": IMAGE_EXTS,
        "sim_versions": short_versions,
        "matrix": matrix,
        "run_date": latest_run.get("created_at", "")[:10],
        "run_url": latest_run.get("html_url", ""),
        "source": "publish-images.yaml",
        "history": history,
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
