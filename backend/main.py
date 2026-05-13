import asyncio
import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()  # loads all .env vars into os.environ before boto3 initialises

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import init_db, AsyncSessionLocal
from routers import analytics, automation, builds, health_analysis, improvement, infra, issues, insights, logs, nightly, overview, prs, registry, tags
from services import github_client as gh
from services import log_store
from services import pr_automation

logger = logging.getLogger("auto_ingest")

CORS_ORIGINS = ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"]

# Workflows to auto-monitor for log ingestion
AUTO_INGEST_WORKFLOWS = ["postmerge-ci.yml", "nightly.yml"]
AUTO_INGEST_INTERVAL = 300  # seconds between polls


async def _ingest_run(run_id: int) -> int:
    """Ingest all job logs for a single GHA run into the DB. Returns line count."""
    async with AsyncSessionLocal() as db:
        if await log_store.run_has_logs(db, str(run_id)):
            return 0
        jobs_data = await gh.get_run_jobs(run_id)
        count = 0
        for job in jobs_data.get("jobs", []):
            raw = await gh.get_job_logs(job["id"])
            for line in raw.splitlines():
                line = line.strip()
                if not line:
                    continue
                low = line.lower()
                level = "ERROR" if "error" in low else "WARNING" if "warn" in low else "INFO"
                await log_store.save_log(db, "gha", str(run_id), level, line, {"job": job["name"]})
                count += 1
    return count


async def _warm_stats_cache():
    """Keep retrying GitHub stats endpoints until all are cached.
    Stats API returns 202 while computing; for large repos this can take many minutes."""
    await asyncio.sleep(5)
    pending = {
        "contributors": gh.get_contributor_stats,
        "commit_activity": gh.get_commit_activity,
        "code_frequency": gh.get_code_frequency,
        "participation": gh.get_participation,
    }
    logger.info("Pre-warming GitHub stats cache for: %s", list(pending))
    while pending:
        for name in list(pending):
            try:
                result = await pending[name](retries=1)
                if result is not None:
                    del pending[name]
                    logger.info("Stats cached: %s (%d remaining)", name, len(pending))
            except Exception as exc:
                logger.warning("Stats warm-up error for %s: %s", name, exc)
        if pending:
            await asyncio.sleep(20)
    logger.info("All GitHub stats cached.")


async def _auto_ingest_loop():
    """Background task: every AUTO_INGEST_INTERVAL seconds, pull logs for new completed runs."""
    await asyncio.sleep(10)  # small delay to let the app fully start
    while True:
        try:
            for workflow in AUTO_INGEST_WORKFLOWS:
                data = await gh.get_workflow_runs(workflow, per_page=10)
                for run in data.get("workflow_runs", []):
                    if run.get("status") != "completed":
                        continue
                    run_id = run["id"]
                    ingested = await _ingest_run(run_id)
                    if ingested:
                        logger.info("Auto-ingested %d lines from run %s (%s)", ingested, run_id, workflow)
        except Exception as exc:
            logger.warning("Auto-ingest error: %s", exc)
        await asyncio.sleep(AUTO_INGEST_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    ingest_task = asyncio.create_task(_auto_ingest_loop())
    asyncio.create_task(_warm_stats_cache())
    pr_automation.start_scheduler()  # starts paused (enabled=False by default)
    yield
    ingest_task.cancel()
    pr_automation.stop_scheduler()
    try:
        await ingest_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="IsaacLab Dashboard API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Return JSON errors with CORS headers so the browser can read them."""
    origin = request.headers.get("origin", "")
    headers = {}
    if origin in CORS_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers=headers,
    )

app.include_router(overview.router)
app.include_router(analytics.router)
app.include_router(automation.router)
app.include_router(prs.router)
app.include_router(builds.router)
app.include_router(nightly.router)
app.include_router(logs.router)
app.include_router(infra.router)
app.include_router(registry.router)
app.include_router(issues.router)
app.include_router(insights.router)
app.include_router(health_analysis.router)
app.include_router(improvement.router)
app.include_router(tags.router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
