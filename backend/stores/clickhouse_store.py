"""
ClickHouse implementation of AnalyticsStore.

Handles: schema setup, event ingestion, aggregation queries.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import clickhouse_connect
from clickhouse_connect.driver.asyncclient import AsyncClient

from .base import AnalyticsStore, WorkflowRun, Job, FailureCluster


class ClickHouseStore(AnalyticsStore):
    """ClickHouse warehouse for CI analytics."""

    def __init__(self):
        """Initialize from environment: CLICKHOUSE_HOST, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD, CLICKHOUSE_DB."""
        self.host = os.getenv("CLICKHOUSE_HOST", "localhost")
        self.port = int(os.getenv("CLICKHOUSE_PORT", "8123"))
        self.user = os.getenv("CLICKHOUSE_USER", "default")
        self.password = os.getenv("CLICKHOUSE_PASSWORD", "")
        self.db = os.getenv("CLICKHOUSE_DB", "gitpulse")
        self.client: Optional[AsyncClient] = None

    async def connect(self) -> None:
        """Establish async connection to ClickHouse."""
        if self.client is None:
            self.client = await clickhouse_connect.get_async_client(
                host=self.host,
                port=self.port,
                username=self.user,
                password=self.password,
                database=self.db,
            )
            await self._init_schema()

    async def disconnect(self) -> None:
        """Close connection."""
        if self.client:
            await self.client.close()
            self.client = None

    async def _init_schema(self) -> None:
        """Create tables if they don't exist."""
        if not self.client:
            return

        # Raw event tables
        await self.client.command("""
            CREATE TABLE IF NOT EXISTS ci_workflow_runs (
                run_id UInt64,
                repo String,
                workflow String,
                branch String,
                event String,
                arch Nullable(String),
                status String,
                conclusion Nullable(String),
                commit_sha String,
                actor String,
                created_at DateTime,
                started_at Nullable(DateTime),
                updated_at DateTime,
                run_attempt UInt32,
                _updated_at DateTime DEFAULT now()
            ) ENGINE = ReplacingMergeTree(_updated_at)
            ORDER BY (repo, run_id)
        """)

        await self.client.command("""
            CREATE TABLE IF NOT EXISTS ci_jobs (
                job_id UInt64,
                run_id UInt64,
                repo String,
                workflow String,
                job_name String,
                arch Nullable(String),
                runner String,
                conclusion Nullable(String),
                started_at Nullable(DateTime),
                completed_at Nullable(DateTime),
                duration_ms UInt64,
                attempt UInt32,
                _updated_at DateTime DEFAULT now()
            ) ENGINE = ReplacingMergeTree(_updated_at)
            ORDER BY (repo, job_id)
        """)

        # NOTE: aggregation is done at query time over ci_jobs FINAL (correct at
        # single-repo scale). Pre-computed materialized views are deferred until
        # proven necessary — an incremental MV over a ReplacingMergeTree source
        # sums pre-dedup duplicates permanently, so it must be a REFRESHABLE MV
        # recomputing from FINAL, added later as an optimization.

    async def ingest_workflow_run(self, run: WorkflowRun) -> None:
        """Insert or update workflow run (async_insert for batch efficiency)."""
        if not self.client:
            await self.connect()

        await self.client.insert(
            "ci_workflow_runs",
            [
                [
                    run.run_id,
                    run.repo,
                    run.workflow,
                    run.branch,
                    run.event,
                    run.arch,
                    run.status,
                    run.conclusion,
                    run.commit_sha,
                    run.actor,
                    run.created_at,
                    run.started_at,
                    run.updated_at,
                    run.run_attempt,
                ]
            ],
            column_names=[
                "run_id",
                "repo",
                "workflow",
                "branch",
                "event",
                "arch",
                "status",
                "conclusion",
                "commit_sha",
                "actor",
                "created_at",
                "started_at",
                "updated_at",
                "run_attempt",
            ],
            settings={"async_insert": 1},
        )

    async def ingest_job(self, job: Job) -> None:
        """Insert or update job (async_insert for batch efficiency)."""
        if not self.client:
            await self.connect()

        await self.client.insert(
            "ci_jobs",
            [
                [
                    job.job_id,
                    job.run_id,
                    job.repo,
                    job.workflow,
                    job.job_name,
                    job.arch,
                    job.runner,
                    job.conclusion,
                    job.started_at,
                    job.completed_at,
                    job.duration_ms,
                    job.attempt,
                ]
            ],
            column_names=[
                "job_id",
                "run_id",
                "repo",
                "workflow",
                "job_name",
                "arch",
                "runner",
                "conclusion",
                "started_at",
                "completed_at",
                "duration_ms",
                "attempt",
            ],
            settings={"async_insert": 1},
        )

    @staticmethod
    def _since(days: int) -> datetime:
        """Naive UTC lower-bound for a rolling window (matches DateTime columns)."""
        return (datetime.now(timezone.utc) - timedelta(days=days)).replace(tzinfo=None)

    async def get_flakes(
        self,
        repo: str,
        job_name: Optional[str] = None,
        days: int = 30,
    ) -> list[tuple[str, int, int]]:
        """Get flaky jobs: (job_name, pass_count, fail_count).

        FINAL collapses ReplacingMergeTree duplicates so counts aren't inflated.
        Values are parameterized (server-side bind) — no SQL injection, and job
        names containing quotes/parens no longer break the query.
        """
        if not self.client:
            await self.connect()

        params: dict[str, Any] = {"repo": repo, "since": self._since(days)}
        job_filter = ""
        if job_name:
            job_filter = "AND job_name = {job_name:String}"
            params["job_name"] = job_name

        query = f"""
            SELECT
                job_name,
                countIf(conclusion = 'success') AS passes,
                countIf(conclusion = 'failure') AS fails
            FROM ci_jobs FINAL
            WHERE repo = {{repo:String}}
              AND started_at >= {{since:DateTime}}
              AND attempt > 1
              {job_filter}
            GROUP BY job_name
            HAVING passes > 0 AND fails > 0
            ORDER BY fails DESC
        """
        result = await self.client.query(query, parameters=params)
        return [(row[0], row[1], row[2]) for row in result.result_rows]

    async def get_chronic_failures(
        self,
        repo: str,
        days: int = 14,
        min_streak: int = 3,
    ) -> list[dict[str, Any]]:
        """Chronic failures: >= min_streak CONSECUTIVE days with 0 passes, in window.

        Matches AMD's rule ("3+ consecutive days, zero successful runs, last 14d").
        Uses the gaps-and-islands pattern: consecutive zero-pass days share the
        island key (day - rowNumber), and each island's row count is the streak.
        """
        if not self.client:
            await self.connect()

        query = """
            WITH daily AS (
                SELECT
                    job_name, arch, workflow,
                    toDate(completed_at) AS d,
                    countIf(conclusion = 'success') AS passes,
                    count() AS runs
                FROM ci_jobs FINAL
                WHERE repo = {repo:String}
                  AND completed_at >= {since:DateTime}
                GROUP BY job_name, arch, workflow, d
                HAVING passes = 0 AND runs > 0
            ),
            islands AS (
                SELECT
                    job_name, arch, workflow, d,
                    d - toIntervalDay(
                        row_number() OVER (
                            PARTITION BY job_name, arch, workflow ORDER BY d
                        )
                    ) AS grp
                FROM daily
            )
            SELECT
                job_name, arch, workflow,
                max(d) AS last_fail_date,
                count() AS streak_days
            FROM islands
            GROUP BY job_name, arch, workflow, grp
            HAVING streak_days >= {min_streak:UInt32}
            ORDER BY streak_days DESC
        """
        result = await self.client.query(
            query,
            parameters={"repo": repo, "since": self._since(days), "min_streak": min_streak},
            # Bound parallelism: the window-function pipeline otherwise exhausts the
            # thread pool on small Railway instances (CANNOT_SCHEDULE_TASK / code 439).
            settings={"max_threads": 2, "max_execution_time": 30},
        )
        return [
            {
                "job_name": row[0],
                "arch": row[1],
                "workflow": row[2],
                "last_fail_date": str(row[3]),
                "streak_days": int(row[4]),
            }
            for row in result.result_rows
        ]

    async def get_slowest_jobs(
        self,
        repo: str,
        arch: Optional[str] = None,
        limit: int = 15,
    ) -> list[dict[str, Any]]:
        """Slowest jobs by median wall time (top N)."""
        if not self.client:
            await self.connect()

        params: dict[str, Any] = {"repo": repo, "limit": limit}
        arch_filter = ""
        if arch:
            arch_filter = "AND arch = {arch:String}"
            params["arch"] = arch

        query = f"""
            SELECT
                job_name,
                arch,
                quantile(0.5)(duration_ms) AS median_ms,
                quantile(0.95)(duration_ms) AS p95_ms,
                quantile(0.99)(duration_ms) AS p99_ms,
                count() AS run_count
            FROM ci_jobs FINAL
            WHERE repo = {{repo:String}}
              AND duration_ms > 0
              AND conclusion = 'success'
              {arch_filter}
            GROUP BY job_name, arch
            ORDER BY median_ms DESC
            LIMIT {{limit:UInt32}}
        """
        result = await self.client.query(query, parameters=params)
        return [
            {
                "job_name": row[0],
                "arch": row[1],
                "median_ms": int(row[2]),
                "p95_ms": int(row[3]),
                "p99_ms": int(row[4]),
                "run_count": int(row[5]),
            }
            for row in result.result_rows
        ]

    async def get_failure_clusters(
        self,
        repo: str,
        days: int = 30,
    ) -> list[FailureCluster]:
        """Failure clusters by (job_name, workflow, arch), most-failed first."""
        if not self.client:
            await self.connect()

        query = """
            SELECT
                job_name,
                workflow,
                arch,
                countIf(conclusion = 'failure') AS fail_count,
                max(completed_at) AS last_seen
            FROM ci_jobs FINAL
            WHERE repo = {repo:String}
              AND completed_at >= {since:DateTime}
              AND conclusion IN ('failure', 'error')
            GROUP BY job_name, workflow, arch
            ORDER BY fail_count DESC
        """
        result = await self.client.query(
            query, parameters={"repo": repo, "since": self._since(days)}
        )
        return [
            FailureCluster(
                job_name=row[0],
                workflow=row[1],
                arch=row[2],
                fail_count=int(row[3]),
                last_seen=datetime.fromisoformat(str(row[4])),
            )
            for row in result.result_rows
        ]
