import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import pr_automation
from services.pr_automation import RUNNER_RECOMMENDATIONS
from services import github_client as gh

router = APIRouter(prefix="/automation", tags=["automation"])


class ConfigUpdate(BaseModel):
    enabled: bool | None = None
    interval_minutes: int | None = None


@router.get("/status")
async def get_status():
    return pr_automation.STATE


@router.post("/run")
async def trigger_run():
    if pr_automation.STATE["running"]:
        return {"status": "already_running", "state": pr_automation.STATE}
    asyncio.create_task(pr_automation.run_once())
    return {"status": "started"}


@router.post("/config")
async def update_config(body: ConfigUpdate):
    if body.enabled is not None:
        pr_automation.STATE["enabled"] = body.enabled
        if body.enabled:
            pr_automation.start_scheduler()
        else:
            pr_automation.stop_scheduler()
    if body.interval_minutes is not None:
        if body.interval_minutes < 1:
            raise HTTPException(400, "interval_minutes must be >= 1")
        pr_automation.STATE["interval_minutes"] = body.interval_minutes
    return pr_automation.STATE


async def _has_gpu_runners() -> bool:
    """Check if the active repo has any GPU-labeled self-hosted runners."""
    try:
        data = await gh.get_runners()
        runners = data.get("runners", [])
        return any(
            any("gpu" in lbl.get("name", "").lower() for lbl in r.get("labels", []))
            for r in runners
        )
    except Exception:
        return False


@router.get("/runner-recommendations")
async def get_runner_recommendations():
    """Return runner recommendations per PR classification. Adapts to whether the active repo has GPU runners."""
    has_gpu = await _has_gpu_runners()

    if has_gpu:
        recs = RUNNER_RECOMMENDATIONS
        best_practices = [
            {
                "rule": "docs-only PRs never need GPU runners",
                "classification": "docs",
                "runner": "ubuntu-latest",
                "rationale": "Docs builds are CPU-bound. Using a hosted runner saves GPU quota for real workloads.",
            },
            {
                "rule": "Unit/CPU tests can run on hosted runners",
                "classification": "tests",
                "runner": "ubuntu-latest",
                "rationale": "Tests without hardware-specific imports don't need a GPU node.",
            },
            {
                "rule": "Source changes should trigger GPU smoke tests",
                "classification": "source",
                "runner": "gpu",
                "rationale": "Hardware-dependent code changes need at least one GPU smoke test to catch regressions early.",
            },
            {
                "rule": "CI/CD changes only need lint + YAML validation",
                "classification": "ci",
                "runner": "ubuntu-latest",
                "rationale": "Workflow file changes don't execute hardware code. Pre-commit + YAML lint is sufficient.",
            },
            {
                "rule": "Mixed PRs default to GPU runner",
                "classification": "mixed",
                "runner": "gpu",
                "rationale": "When a PR touches multiple categories, use a GPU runner to be safe.",
            },
        ]
    else:
        recs = {k: {**v, "runner": "ubuntu-latest", "gpu": False} for k, v in RUNNER_RECOMMENDATIONS.items()}
        best_practices = [
            {
                "rule": "All PR types can use hosted runners",
                "classification": "all",
                "runner": "ubuntu-latest",
                "rationale": "No GPU self-hosted runners detected for this repo. All CI jobs run on GitHub-hosted runners.",
            },
            {
                "rule": "Use matrix builds for multi-platform coverage",
                "classification": "source",
                "runner": "ubuntu-latest",
                "rationale": "GitHub-hosted runners support ubuntu, windows, and macos matrix builds at no extra infra cost.",
            },
        ]

    return {"recommendations": recs, "best_practices": best_practices, "has_gpu": has_gpu}
