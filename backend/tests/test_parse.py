"""
Unit tests for GitHub webhook/API payload parsing.

Pure functions — no ClickHouse, no network. These pin down the ingestion
correctness bugs found in the stores/ audit:
  - WorkflowRun.run_attempt must come from `run_attempt`, NOT `run_number`.
  - Job.duration_ms must never be negative (clock skew -> UInt64 wraparound).
"""

from datetime import datetime, timezone

from stores.parse import parse_workflow_run, parse_workflow_job


def _wf_run_payload(**overrides):
    run = {
        "id": 100,
        "name": "CI",
        "head_branch": "main",
        "event": "push",
        "status": "completed",
        "conclusion": "failure",
        "head_sha": "abc123",
        "run_number": 4242,      # monotonic workflow counter — NOT the retry
        "run_attempt": 2,        # the retry counter we actually want
        "created_at": "2026-07-01T10:00:00Z",
        "run_started_at": "2026-07-01T10:01:00Z",
        "updated_at": "2026-07-01T10:30:00Z",
    }
    run.update(overrides)
    return {
        "action": "completed",
        "workflow_run": run,
        "repository": {"full_name": "ROCm/TheRock"},
        "sender": {"login": "octocat"},
    }


def test_workflow_run_attempt_comes_from_run_attempt_not_run_number():
    wr = parse_workflow_run(_wf_run_payload())
    assert wr.run_attempt == 2, "run_attempt must be the retry counter, not run_number(4242)"


def test_workflow_run_uses_event_updated_at_for_versioning():
    wr = parse_workflow_run(_wf_run_payload())
    assert wr.updated_at == datetime(2026, 7, 1, 10, 30, tzinfo=timezone.utc)


def _wf_job_payload(started, completed, **overrides):
    job = {
        "id": 55,
        "run_id": 100,
        "run_attempt": 3,
        "name": "build (gfx942)",
        "labels": ["ubuntu-22.04"],
        "conclusion": "success",
        "started_at": started,
        "completed_at": completed,
    }
    job.update(overrides)
    return {
        "action": "completed",
        "workflow_job": job,
        "repository": {"full_name": "ROCm/TheRock"},
        "workflow_run": {"name": "CI"},
    }


def test_job_duration_computed_in_ms():
    p = _wf_job_payload("2026-07-01T10:00:00Z", "2026-07-01T10:05:00Z")
    j = parse_workflow_job(p)
    assert j.duration_ms == 300_000  # 5 minutes


def test_job_duration_clamped_to_zero_on_clock_skew():
    # completed BEFORE started -> negative delta -> must clamp, not wrap UInt64
    p = _wf_job_payload("2026-07-01T10:05:00Z", "2026-07-01T10:00:00Z")
    j = parse_workflow_job(p)
    assert j.duration_ms == 0, "negative durations must clamp to 0, never go negative"


def test_job_attempt_comes_from_run_attempt():
    p = _wf_job_payload("2026-07-01T10:00:00Z", "2026-07-01T10:05:00Z")
    j = parse_workflow_job(p)
    assert j.attempt == 3
