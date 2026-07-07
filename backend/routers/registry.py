import asyncio

from fastapi import APIRouter, HTTPException

from config import settings
from services import aws_ecr
from services import github_client as gh
from services.github_client import get_active_repo_parts

router = APIRouter(prefix="/registry", tags=["registry"])

_PUSH_WORKFLOW = "publish-images.yaml"


def _registry_images() -> tuple[str, str]:
    """Return (ngc_image, ghcr_image) for the currently active repo.

    The NGC image is only produced when an NGC org is configured; otherwise it
    is an empty string so no registry is hardcoded to a specific vendor.
    """
    owner, repo = get_active_repo_parts()
    image_name = repo.lower().replace("_", "-")
    ngc_image = f"nvcr.io/{settings.NGC_ORG}/{image_name}" if settings.NGC_ORG else ""
    return ngc_image, f"ghcr.io/{owner.lower()}/{repo.lower()}"


@router.get("/push-status")
async def get_push_status():
    """Return real push status for NGC, GHCR, and HPC derived from publish-images workflow runs."""
    NGC_IMAGE, GHCR_IMAGE = _registry_images()
    try:
        data = await gh.get_workflow_runs(_PUSH_WORKFLOW, per_page=5)
        runs = data.get("workflow_runs", [])
    except Exception:
        runs = []

    latest = runs[0] if runs else None
    conclusion = latest.get("conclusion") if latest else None
    run_date = (latest.get("created_at") or "")[:10] if latest else None
    run_url = latest.get("html_url") if latest else None
    display_title = (latest.get("display_title") or "")[:60] if latest else None

    # Derive per-registry status from latest run's jobs
    ngc_status = "unknown"
    ghcr_status = "unknown"
    if latest:
        try:
            jobs_data = await gh.get_run_jobs(latest["id"])
            jobs = jobs_data.get("jobs", [])
            push_job = next(
                (j for j in jobs if "push" in j.get("name", "").lower() or "build" in j.get("name", "").lower()),
                None,
            )
            if push_job:
                c = push_job.get("conclusion") or push_job.get("status", "unknown")
                ngc_status = c
                ghcr_status = c
            elif conclusion:
                ngc_status = conclusion
                ghcr_status = conclusion
        except Exception:
            ngc_status = conclusion or "unknown"
            ghcr_status = conclusion or "unknown"

    return {
        "ngc": {
            "image": NGC_IMAGE,
            "status": ngc_status,
            "run_date": run_date,
            "run_url": run_url,
            "display_title": display_title,
        },
        "ghcr": {
            "image": GHCR_IMAGE,
            "status": ghcr_status,
            "run_date": run_date,
            "run_url": run_url,
            "display_title": display_title,
        },
        "hpc": {
            "status": "unavailable",
            "note": "Singularity export runs via SLURM nightly pipeline",
        },
        "workflow": _PUSH_WORKFLOW,
        "run_count": len(runs),
    }


@router.get("/ecr/images")
async def list_ecr_images(max_results: int = 50):
    if not aws_ecr.is_configured():
        return {
            "images": [],
            "repository": settings.ECR_REPO,
            "uri": aws_ecr.get_ecr_uri(),
            "configured": False,
            "note": "ECR is not configured. Set ECR_REPO and ECR_ACCOUNT_ID.",
        }
    try:
        images = aws_ecr.list_images(max_results=max_results)
        return {
            "images": images,
            "repository": settings.ECR_REPO,
            "uri": aws_ecr.get_ecr_uri(),
            "configured": True,
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/ecr/auth")
async def ecr_login_token():
    try:
        return aws_ecr.get_login_token()
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/ecr/uri")
async def ecr_uri():
    return {"uri": aws_ecr.get_ecr_uri()}


@router.get("/ecr/info")
async def ecr_repo_info():
    if not aws_ecr.is_configured():
        return {"configured": False, "note": "ECR is not configured. Set ECR_REPO and ECR_ACCOUNT_ID."}
    try:
        return aws_ecr.describe_repository()
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.delete("/ecr/images/{tag}")
async def delete_ecr_image(tag: str):
    try:
        aws_ecr.delete_image(tag)
        return {"deleted": tag}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
