import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import pr_automation
from services.pr_automation import RUNNER_RECOMMENDATIONS

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


@router.get("/runner-recommendations")
async def get_runner_recommendations():
    """Return runner recommendations per PR classification plus best-practice guide."""
    return {
        "recommendations": RUNNER_RECOMMENDATIONS,
        "best_practices": [
            {
                "rule": "docs-only PRs never need GPU runners",
                "classification": "docs",
                "runner": "ubuntu-latest",
                "rationale": "Sphinx/MkDocs builds are CPU-bound. Using a hosted runner saves GPU quota for real workloads.",
            },
            {
                "rule": "Unit/CPU tests can run on hosted runners",
                "classification": "tests",
                "runner": "ubuntu-latest",
                "rationale": "Tests marked cpu-only or without isaaclab_physx imports don't need a GPU node.",
            },
            {
                "rule": "Source changes should trigger GPU smoke tests",
                "classification": "source",
                "runner": "gpu",
                "rationale": "Physics/rendering code changes need at least one GPU smoke test to catch Isaac Sim regressions early.",
            },
            {
                "rule": "CI/CD changes only need lint + YAML validation",
                "classification": "ci",
                "runner": "ubuntu-latest",
                "rationale": "Workflow file changes don't execute simulation code. Pre-commit + YAML lint is sufficient.",
            },
            {
                "rule": "Mixed PRs default to GPU runner",
                "classification": "mixed",
                "runner": "gpu",
                "rationale": "When a PR touches multiple categories, assume the worst case and use a GPU runner.",
            },
        ],
    }
