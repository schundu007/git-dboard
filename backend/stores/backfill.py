"""
Historical data backfill worker.

Paginates GitHub Actions API to populate ClickHouse with 90-180d of history.
Run on repo activation or as a cron job.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from .parse import parse_workflow_run, parse_workflow_job
from .clickhouse_store import ClickHouseStore


class BackfillWorker:
    """Backfill CI data from GitHub Actions API to ClickHouse."""

    def __init__(self, gh_client: Any, store: ClickHouseStore):
        """
        Args:
            gh_client: GitHubClient instance from services.github_client
            store: ClickHouseStore instance
        """
        self.gh = gh_client
        self.store = store

    async def backfill_workflow_runs(
        self,
        repo: str,
        days: int = 90,
        limit: Optional[int] = None,
    ) -> int:
        """
        Backfill workflow runs from GitHub Actions API.
        
        Fetches all runs from the last N days, ingests to ClickHouse.
        ReplacingMergeTree handles deduplication via updated_at.
        
        Args:
            repo: repo slug (e.g., "ROCm/ROCm-gfx")
            days: how far back to fetch
            limit: stop after N runs (for testing)
        
        Returns:
            count of runs ingested
        """
        await self.store.connect()

        since = datetime.now(timezone.utc) - timedelta(days=days)
        page = 1
        count = 0

        while True:
            # Fetch one page of runs
            runs = await self.gh.list_workflow_runs(
                repo=repo,
                created=f">={since.isoformat()}",
                per_page=100,
                page=page,
            )

            if not runs or not runs.get("workflow_runs"):
                break

            for run in runs["workflow_runs"]:
                wr = parse_workflow_run(
                    {"workflow_run": run, "repository": {"full_name": repo}}
                )
                await self.store.ingest_workflow_run(wr)
                count += 1

                if limit and count >= limit:
                    return count

            page += 1

            # Pagination limit safety
            if page > 20:
                print(f"[backfill] stopping at page {page}")
                break

        await self.store.disconnect()
        return count

    async def backfill_jobs(
        self,
        repo: str,
        run_ids: Optional[list[int]] = None,
        days: int = 90,
    ) -> int:
        """
        Backfill jobs for runs.
        
        If run_ids given, fetch jobs for those runs.
        Otherwise, fetch all runs from the last N days, then their jobs.
        
        Args:
            repo: repo slug
            run_ids: specific run IDs to fetch jobs for
            days: if run_ids not given, fetch runs from last N days
        
        Returns:
            count of jobs ingested
        """
        await self.store.connect()

        if not run_ids:
            # Fetch recent runs
            since = datetime.now(timezone.utc) - timedelta(days=days)
            runs = await self.gh.list_workflow_runs(
                repo=repo,
                created=f">={since.isoformat()}",
                per_page=100,
            )
            run_ids = [r["id"] for r in runs.get("workflow_runs", [])]

        count = 0
        for run_id in run_ids:
            jobs = await self.gh.get_run_jobs(run_id)

            for job in jobs.get("jobs", []):
                j = parse_workflow_job(
                    {"workflow_job": job, "repository": {"full_name": repo}}
                )
                await self.store.ingest_job(j)
                count += 1

        await self.store.disconnect()
        return count


async def main():
    """CLI entry for backfill (run with: python -m stores.backfill)."""
    from services import github_client as gh

    worker = BackfillWorker(gh, ClickHouseStore())
    repo = gh.get_active_repo_slug()

    print(f"[backfill] starting for {repo}...")
    run_count = await worker.backfill_workflow_runs(repo, days=90, limit=200)
    print(f"[backfill] ingested {run_count} workflow runs")

    # Uncomment after running workflow_runs:
    # job_count = await worker.backfill_jobs(repo, days=90)
    # print(f"[backfill] ingested {job_count} jobs")


if __name__ == "__main__":
    asyncio.run(main())
