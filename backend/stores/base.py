"""
Abstract analytics store interface.

Implementations: GitHub live API, ClickHouse warehouse.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional


@dataclass
class WorkflowRun:
    """GitHub Actions workflow run event."""
    run_id: int
    repo: str
    workflow: str
    branch: str
    event: str
    arch: Optional[str]
    status: str  # queued, in_progress, completed
    conclusion: Optional[str]  # success, failure, cancelled, skipped
    commit_sha: str
    actor: str
    created_at: datetime
    started_at: Optional[datetime]
    updated_at: datetime
    run_attempt: int


@dataclass
class Job:
    """GitHub Actions job."""
    job_id: int
    run_id: int
    repo: str
    workflow: str
    job_name: str
    arch: Optional[str]
    runner: str
    conclusion: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_ms: int
    attempt: int


@dataclass
class FailureCluster:
    """Aggregated job failures by dimension."""
    job_name: str
    workflow: str
    arch: Optional[str]
    fail_count: int
    last_seen: datetime


class AnalyticsStore(ABC):
    """
    Abstract analytics data store.
    
    Guarantees:
    - Idempotent writes (ReplacingMergeTree via updated_at)
    - Async I/O
    - No transaction guarantees (ClickHouse eventual consistency)
    """

    @abstractmethod
    async def ingest_workflow_run(self, run: WorkflowRun) -> None:
        """Insert or update a workflow run."""
        pass

    @abstractmethod
    async def ingest_job(self, job: Job) -> None:
        """Insert or update a job record."""
        pass

    @abstractmethod
    async def get_flakes(
        self,
        repo: str,
        job_name: Optional[str] = None,
        days: int = 30,
    ) -> list[tuple[str, int, int]]:
        """
        Get flaky jobs: (job_name, pass_count, fail_count) 
        Filters to jobs with ≥2 attempts and varying conclusions.
        """
        pass

    @abstractmethod
    async def get_chronic_failures(
        self,
        repo: str,
        days: int = 7,
    ) -> list[dict[str, Any]]:
        """
        Get chronic failures: jobs with N consecutive days of 0 passes.
        Returns: [{job_name, arch, workflow, last_fail_date, streak_days}, ...]
        """
        pass

    @abstractmethod
    async def get_slowest_jobs(
        self,
        repo: str,
        arch: Optional[str] = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """
        Get slowest jobs by median wall time.
        Returns: [{job_name, median_ms, p95_ms, p99_ms, run_count}, ...]
        """
        pass

    @abstractmethod
    async def get_failure_clusters(
        self,
        repo: str,
        days: int = 30,
    ) -> list[FailureCluster]:
        """
        Get failure clusters grouped by (job_name, workflow, arch).
        """
        pass
