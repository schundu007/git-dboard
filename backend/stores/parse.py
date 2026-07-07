"""
Pure parsers: GitHub webhook / Actions-API payloads -> WorkflowRun / Job.

Shared by webhooks.py (live events) and backfill.py (historical API) so the
mapping lives in ONE place. No ClickHouse, no network — trivially unit-testable.
"""

from datetime import datetime
from typing import Any, Optional

from .base import WorkflowRun, Job


def _dt(value: Optional[str]) -> Optional[datetime]:
    """Parse a GitHub ISO-8601 timestamp ('...Z') to aware datetime."""
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _arch_from_labels(labels: list[str]) -> Optional[str]:
    """Best-effort runner OS/arch label (first match)."""
    for label in labels:
        if any(x in label for x in ("ubuntu", "macos", "windows")):
            return label
    return None


def parse_workflow_run(payload: dict[str, Any]) -> WorkflowRun:
    """Map a `workflow_run` webhook payload to a WorkflowRun.

    NOTE: run_attempt is GitHub's `run_attempt` (retry counter), NOT
    `run_number` (the monotonic workflow sequence). Flake detection depends
    on this being the real attempt.
    """
    run = payload["workflow_run"]
    return WorkflowRun(
        run_id=run["id"],
        repo=payload["repository"]["full_name"],
        workflow=run.get("name", ""),
        branch=run.get("head_branch", ""),
        event=run.get("event", ""),
        arch=None,  # not present on workflow_run; only on jobs
        status=run["status"],
        conclusion=run.get("conclusion"),
        commit_sha=run["head_sha"],
        actor=(
            run.get("actor", {}).get("login")
            or payload.get("sender", {}).get("login", "")
        ),
        created_at=_dt(run["created_at"]),
        started_at=_dt(run.get("run_started_at")),
        updated_at=_dt(run["updated_at"]),
        run_attempt=run.get("run_attempt", 1),
    )


def parse_workflow_job(payload: dict[str, Any]) -> Job:
    """Map a `workflow_job` webhook / API payload to a Job.

    duration_ms is clamped to >= 0: clock skew where completed_at < started_at
    would otherwise produce a negative value that wraps to a huge UInt64.
    """
    job = payload["workflow_job"]
    labels = job.get("labels", [])
    started = _dt(job.get("started_at"))
    completed = _dt(job.get("completed_at"))

    duration_ms = 0
    if started and completed:
        duration_ms = max(0, int((completed - started).total_seconds() * 1000))

    return Job(
        job_id=job["id"],
        run_id=job["run_id"],
        repo=payload["repository"]["full_name"],
        workflow=payload.get("workflow_run", {}).get("name", "") or job.get("name", ""),
        job_name=job["name"],
        arch=_arch_from_labels(labels),
        runner=",".join(labels),
        conclusion=job.get("conclusion"),
        started_at=started,
        completed_at=completed,
        duration_ms=duration_ms,
        attempt=job.get("run_attempt", 1),
    )
